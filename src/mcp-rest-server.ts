import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { RestServerTransport } from '@chatmcp/sdk/server/rest.js';
import { Config } from './types/index.js';
import {
  DEFAULT_SERVER_ENDPOINT,
  DEFAULT_SERVER_PORT,
  ERROR_API_KEY_REQUIRED,
  ERROR_API_HOST_REQUIRED,
  RESOURCE_MODE_URL,
  TRANSPORT_MODE_REST
} from './const/index.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ServiceManager } from './services/index.js';
import { MediaService } from './services/media-service.js';
import { MiniMaxAPI } from './utils/api.js';
import { ConfigManager } from './config/ConfigManager.js';

// Retry configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;

/**
 * MCP REST Server class, provides REST API implementation of MCPServer functionality
 */
export class MCPRestServer {
  private server!: Server;
  private mcpServer!: McpServer;
  private config!: Config;
  private api!: MiniMaxAPI;
  private mediaService!: MediaService;
  private transport: RestServerTransport | null = null;

  /**
   * Create a REST server instance
   * @param customConfig Configuration object
   */
  constructor(customConfig?: Partial<Config>) {
    // Initialize configuration
    this.initializeConfig(customConfig);

    // Create API and service instances
    this.api = new MiniMaxAPI(this.config);
    this.mediaService = new MediaService(this.api);

    // Create MCP server instance - used to get tool definitions
    this.mcpServer = new McpServer({
      name: 'minimax-mcp-js',
      version: '1.0.0',
    });

    // Create low-level server instance
    this.server = new Server(
      {
        name: 'minimax-mcp-js',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    );

    // Register request handlers
    this.registerRequestHandlers();
  }

  /**
   * Initialize configuration
   * @param customConfig Custom configuration
   */
  private initializeConfig(customConfig?: Partial<Config>): void {
    // Use ConfigManager to get configuration, automatically handling priorities
    this.config = ConfigManager.getConfig(customConfig);

    // Ensure REST transport mode is used
    if (this.config.server) {
      this.config.server.mode = TRANSPORT_MODE_REST;
    } else {
      this.config.server = {
        mode: TRANSPORT_MODE_REST,
        port: DEFAULT_SERVER_PORT,
        endpoint: DEFAULT_SERVER_ENDPOINT
      };
    }

    console.log(`[${new Date().toISOString()}] REST server configuration initialized`);
  }

  /**
   * Update configuration and recreate API instance
   * @param newConfig New configuration object
   */
  public updateConfig(newConfig: Partial<Config>): void {
    // Use ConfigManager to merge configurations
    this.config = ConfigManager.getConfig(newConfig, this.config);

    // Ensure REST transport mode is used
    if (this.config.server) {
      this.config.server.mode = TRANSPORT_MODE_REST;
    }

    // Update API instance and services
    this.api = new MiniMaxAPI(this.config);
    this.mediaService = new MediaService(this.api);

    console.log(`[${new Date().toISOString()}] REST server configuration updated`);
  }

  /**
   * Register all request handlers
   */
  private registerRequestHandlers(): void {
    // Tool-related handlers
    this.registerToolHandlers();

    // Resource-related handlers
    this.registerResourceHandlers();

    // Prompt-related handlers
    this.registerPromptHandlers();
  }

  /**
   * Extract API key from request
   * Only get API key from meta.auth
   */
  private extractApiKeyFromRequest(request: any): string | undefined {
    // Only get from meta.auth
    const metaAuth = request.params?._meta?.auth || request.params?.meta?.auth;
    if (metaAuth?.api_key) return metaAuth.api_key;
    if (metaAuth?.apiKey) return metaAuth.apiKey;

    // API key not found
    return undefined;
  }

  /**
   * Extract configuration from request
   * Only supports getting configuration from params.meta.auth
   */
  private extractRequestConfig(request: any): Partial<Config> {
    const config: Partial<Config> = {};

    // Get configuration from params._meta.auth or meta.auth
    try {
      // First try to get the _meta.auth field from the MCP protocol
      let metaAuth = request.params?._meta?.auth;

      // If it doesn't exist, try to get the meta.auth field
      if (!metaAuth && request.params?.meta?.auth) {
        metaAuth = request.params.meta.auth;
      }

      if (metaAuth && typeof metaAuth === 'object') {
        console.log(`[${new Date().toISOString()}] Getting configuration from request meta.auth`);

        // Use ConfigManager to extract configuration
        const metaAuthConfig = ConfigManager.extractConfigFromMetaAuth(metaAuth);
        if (metaAuthConfig) {
          Object.assign(config, metaAuthConfig);
        }
      }
    } catch (error) {
      console.warn(`[${new Date().toISOString()}] Failed to extract configuration from meta.auth:`, error);
    }

    return config;
  }

  /**
   * Create configuration for request
   */
  private getRequestConfig(request: any): Config {
    // Get request-specific configuration
    const requestConfig = this.extractRequestConfig(request);

    // Merge configurations, request configuration has highest priority
    return ConfigManager.getConfig(requestConfig, this.config);
  }

  /**
   * Register tool-related request handlers
   */
  private registerToolHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      try {
        return {
          tools: [
            {
              name: 'text_to_audio',
              description: 'Convert text to audio',
              arguments: [
                { name: 'text', description: 'Text to convert to audio', required: true },
                { name: 'outputDirectory', description: 'Directory to save output file', required: false },
                { name: 'voiceId', description: 'Voice ID to use, e.g. "female-shaonv"', required: false },
                { name: 'model', description: 'Model to use', required: false },
                { name: 'speed', description: 'Speech speed (0.5-2.0)', required: false },
                { name: 'vol', description: 'Speech volume (0.1-10.0)', required: false },
                { name: 'pitch', description: 'Speech pitch (-12 to 12)', required: false },
                { name: 'emotion', description: 'Speech emotion, values: ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"]', required: false },
                { name: 'format', description: 'Audio format, values: ["pcm", "mp3","flac", "wav"]', required: false },
                { name: 'sampleRate', description: 'Sample rate (Hz), values: [8000, 16000, 22050, 24000, 32000, 44100]', required: false },
                { name: 'bitrate', description: 'Bitrate (bps), values: [64000, 96000, 128000, 160000, 192000, 224000, 256000, 320000]', required: false },
                { name: 'channel', description: 'Audio channels, values: [1, 2]', required: false },
                { name: 'languageBoost', description: 'Language boost', required: false },
                { name: 'outputFile', description: 'Output file path, auto-generated if not provided', required: false }
              ]
            },
            {
              name: 'list_voices',
              description: 'List all available voices',
              arguments: [
                { name: 'voiceType', description: 'Type of voices to list, values: ["all", "system", "voice_cloning"]', required: false }
              ]
            },
            {
              name: 'play_audio',
              description: 'Play audio file. Supports WAV and MP3 formats. Does not support video.',
              arguments: [
                { name: 'inputFilePath', description: 'Path to audio file to play', required: true },
                { name: 'isUrl', description: 'Whether audio file is a URL', required: false }
              ]
            },
            {
              name: 'text_to_image',
              description: 'Generate image based on text prompt',
              arguments: [
                { name: 'prompt', description: 'Text prompt for image generation', required: true },
                { name: 'model', description: 'Model to use', required: false },
                { name: 'aspectRatio', description: 'Image aspect ratio, values: ["1:1", "16:9","4:3", "3:2", "2:3", "3:4", "9:16", "21:9"]', required: false },
                { name: 'n', description: 'Number of images to generate (1-9)', required: false },
                { name: 'promptOptimizer', description: 'Whether to optimize prompt', required: false },
                { name: 'outputDirectory', description: 'Directory to save output file', required: false },
                { name: 'outputFile', description: 'Output file path, auto-generated if not provided', required: false }
              ]
            },
            {
              name: 'generate_video',
              description: 'Generate video based on text prompt',
              arguments: [
                { name: 'prompt', description: 'Text prompt for video generation', required: true },
                { name: 'model', description: 'Model to use, values: ["T2V-01", "T2V-01-Director", "I2V-01", "I2V-01-Director", "I2V-01-live"]', required: false },
                { name: 'firstFrameImage', description: 'First frame image', required: false },
                { name: 'outputDirectory', description: 'Directory to save output file', required: false },
                { name: 'outputFile', description: 'Output file path, auto-generated if not provided', required: false }
              ]
            },
            {
              name: 'voice_clone',
              description: 'Clone voice using provided audio file',
              arguments: [
                { name: 'voiceId', description: 'Voice ID to use', required: true },
                { name: 'audioFile', description: 'Audio file path', required: true },
                { name: 'text', description: 'Text for demo audio', required: false },
                { name: 'outputDirectory', description: 'Directory to save output file', required: false },
                { name: 'isUrl', description: 'Whether audio file is a URL', required: false }
              ]
            },
            {
              name: 'image_to_video',
              description: 'Generate video based on image',
              arguments: [
                { name: 'prompt', description: 'Text prompt for video generation', required: true },
                { name: 'firstFrameImage', description: 'Path to first frame image', required: true },
                { name: 'model', description: 'Model to use, values: ["I2V-01", "I2V-01-Director", "I2V-01-live"]', required: false },
                { name: 'outputDirectory', description: 'Directory to save output file', required: false },
                { name: 'outputFile', description: 'Output file path, auto-generated if not provided', required: false }
              ]
            }
          ]
        };
      } catch (error) {
        throw this.wrapError('Failed to get tool list', error);
      }
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const toolName = request.params.tool;
      const toolParams = request.params.params || {};

      try {
        // Create configuration and API instance for this request
        const requestConfig = this.getRequestConfig(request);
        const requestApi = new MiniMaxAPI(requestConfig);
        const mediaService = new MediaService(requestApi);

        // Log API key (partially hidden)
        const apiKey = this.extractApiKeyFromRequest(request);
        const maskedKey = apiKey
          ? `${apiKey.substring(0, 4)}****${apiKey.substring(apiKey.length - 4)}`
          : 'not provided';
        console.log(`[${new Date().toISOString()}] Using API key: ${maskedKey} to call tool: ${toolName}`);

        // Choose different handler function based on tool name
        switch (toolName) {
          case 'text_to_audio':
            return await this.handleTextToAudio(toolParams, requestApi, mediaService);

          case 'list_voices':
            return await this.handleListVoices(toolParams, requestApi, mediaService);

          case 'play_audio':
            return await this.handlePlayAudio(toolParams);

          case 'text_to_image':
            return await this.handleTextToImage(toolParams, requestApi, mediaService);

          case 'generate_video':
            return await this.handleGenerateVideo(toolParams, requestApi, mediaService);

          case 'voice_clone':
            return await this.handleVoiceClone(toolParams, requestApi, mediaService);

          case 'image_to_video':
            return await this.handleImageToVideo(toolParams, requestApi, mediaService);

          default:
            throw new Error(`Unknown tool: ${toolName}`);
        }
      } catch (error) {
        throw this.wrapError(`Failed to call tool ${toolName}`, error);
      }
    });
  }

  /**
   * Handle text to speech request
   */
  private async handleTextToAudio(args: any, api: MiniMaxAPI, mediaService: MediaService, attempt = 1): Promise<any> {
    try {
      // Call media service to handle request
      const result = await mediaService.generateSpeech(args);
      return result;
    } catch (error) {
      if (attempt < MAX_RETRY_ATTEMPTS) {
        console.warn(`[${new Date().toISOString()}] Failed to generate speech, attempting retry (${attempt}/${MAX_RETRY_ATTEMPTS})`, error);
        // Delay retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1)));
        return this.handleTextToAudio(args, api, mediaService, attempt + 1);
      }
      throw this.wrapError('Failed to generate speech', error);
    }
  }

  /**
   * Handle list voices request
   */
  private async handleListVoices(args: any, api: MiniMaxAPI, mediaService: MediaService, attempt = 1): Promise<any> {
    try {
      // Call media service to handle request
      const result = await mediaService.listVoices(args);
      return result;
    } catch (error) {
      if (attempt < MAX_RETRY_ATTEMPTS) {
        console.warn(`[${new Date().toISOString()}] Failed to list voices, attempting retry (${attempt}/${MAX_RETRY_ATTEMPTS})`, error);
        // Delay retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1)));
        return this.handleListVoices(args, api, mediaService, attempt + 1);
      }
      throw this.wrapError('Failed to list voices', error);
    }
  }

  /**
   * Handle play audio request
   */
  private async handlePlayAudio(args: any): Promise<any> {
    try {
      // This operation needs to use the current mediaService instance
      return {
        content: [
          {
            type: 'text',
            text: `Playing audio: ${args.inputFilePath}`,
          },
        ],
      };
    } catch (error) {
      throw this.wrapError('Failed to play audio', error);
    }
  }

  /**
   * Handle text to image request
   */
  private async handleTextToImage(args: any, api: MiniMaxAPI, mediaService: MediaService, attempt = 1): Promise<any> {
    try {
      // Call media service to handle request
      const result = await mediaService.generateImage(args);
      return result;
    } catch (error) {
      if (attempt < MAX_RETRY_ATTEMPTS) {
        console.warn(`[${new Date().toISOString()}] Failed to generate image, attempting retry (${attempt}/${MAX_RETRY_ATTEMPTS})`, error);
        // Delay retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1)));
        return this.handleTextToImage(args, api, mediaService, attempt + 1);
      }
      throw this.wrapError('Failed to generate image', error);
    }
  }

  /**
   * Handle generate video request
   */
  private async handleGenerateVideo(args: any, api: MiniMaxAPI, mediaService: MediaService, attempt = 1): Promise<any> {
    try {
      // Call media service to handle request
      const result = await mediaService.generateVideo(args);
      return result;
    } catch (error) {
      if (attempt < MAX_RETRY_ATTEMPTS) {
        console.warn(`[${new Date().toISOString()}] Failed to generate video, attempting retry (${attempt}/${MAX_RETRY_ATTEMPTS})`, error);
        // Delay retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1)));
        return this.handleGenerateVideo(args, api, mediaService, attempt + 1);
      }
      throw this.wrapError('Failed to generate video', error);
    }
  }

  /**
   * Handle voice clone request
   */
  private async handleVoiceClone(args: any, api: MiniMaxAPI, mediaService: MediaService, attempt = 1): Promise<any> {
    try {
      // Call media service to handle request
      const result = await mediaService.cloneVoice(args);
      return result;
    } catch (error) {
      // Check if this is a real-name verification error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('voice clone user forbidden') ||
          errorMessage.includes('should complete real-name verification')) {

        // Domestic platform verification URL
        const verificationUrl = 'https://platform.minimaxi.com/user-center/basic-information';

        return {
          content: [
            {
              type: 'text',
              text: `Voice cloning failed: Real-name verification required. To use voice cloning feature, please:\n\n1. Visit MiniMax platform (${verificationUrl})\n2. Complete the real-name verification process\n3. Try again after verification is complete\n\nThis requirement is for security and compliance purposes.`,
            },
          ],
        };
      }

      // Regular retry mechanism
      if (attempt < MAX_RETRY_ATTEMPTS) {
        console.warn(`[${new Date().toISOString()}] Failed to clone voice, attempting retry (${attempt}/${MAX_RETRY_ATTEMPTS})`, error);
        // Delay retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1)));
        return this.handleVoiceClone(args, api, mediaService, attempt + 1);
      }
      throw this.wrapError('Failed to clone voice', error);
    }
  }

  /**
   * Handle image to video request
   */
  private async handleImageToVideo(args: any, api: MiniMaxAPI, mediaService: MediaService, attempt = 1): Promise<any> {
    try {
      // Ensure model is suitable for image to video conversion
      if (!args.model) {
        args.model = 'I2V-01';
      }

      // Ensure firstFrameImage parameter exists
      if (!args.firstFrameImage) {
        throw new Error('Missing required parameter: firstFrameImage');
      }

      // Auto-generate output filename if not provided
      if (!args.outputFile) {
        const promptPrefix = args.prompt.substring(0, 20).replace(/[^\w]/g, '_');
        args.outputFile = `i2v_${promptPrefix}_${Date.now()}`;
      }

      // Call media service to handle request
      const result = await mediaService.generateVideo(args);
      return result;
    } catch (error) {
      if (attempt < MAX_RETRY_ATTEMPTS) {
        console.warn(`[${new Date().toISOString()}] Failed to generate video, attempting retry (${attempt}/${MAX_RETRY_ATTEMPTS})`, error);
        // Delay retry
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, attempt - 1)));
        return this.handleImageToVideo(args, api, mediaService, attempt + 1);
      }
      throw this.wrapError('Failed to generate video', error);
    }
  }

  /**
   * Register resource-related request handlers
   */
  private registerResourceHandlers(): void {
    // List resources handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
      try {
        // Create configuration for this request
        const requestConfig = this.getRequestConfig(request);

        // Return empty list - our implementation doesn't support resource listing
        return {
          resources: []
        };
      } catch (error) {
        throw this.wrapError('Failed to get resource list', error);
      }
    });

    // Read resource handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      try {
        // Create configuration for this request
        const requestConfig = this.getRequestConfig(request);

        // Our implementation doesn't support resource reading, so always return 404
        throw new Error(`Resource does not exist: ${request.params.uri}`);
      } catch (error) {
        throw this.wrapError('Failed to read resource', error);
      }
    });
  }

  /**
   * Register prompt-related request handlers
   */
  private registerPromptHandlers(): void {
    // List prompts handler
    this.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
      try {
        // Create configuration for this request
        const requestConfig = this.getRequestConfig(request);

        // Return empty list - our implementation doesn't support prompt listing
        return {
          prompts: []
        };
      } catch (error) {
        throw this.wrapError('Failed to get prompt list', error);
      }
    });

    // Get prompt handler
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      try {
        // Create configuration for this request
        const requestConfig = this.getRequestConfig(request);

        // Our implementation doesn't support prompt retrieval, so always return 404
        throw new Error(`Prompt does not exist: ${request.params.name}`);
      } catch (error) {
        throw this.wrapError('Failed to get prompt', error);
      }
    });
  }

  /**
   * Start REST server
   */
  public async start(): Promise<void> {
    try {
      // Validate necessary configuration
      if (!this.config.apiKey) {
        throw new Error(ERROR_API_KEY_REQUIRED);
      }

      if (!this.config.apiHost) {
        throw new Error(ERROR_API_HOST_REQUIRED);
      }

      const port = this.config.server?.port || DEFAULT_SERVER_PORT;
      const endpoint = this.config.server?.endpoint || DEFAULT_SERVER_ENDPOINT;

      // Create transport instance
      this.transport = new RestServerTransport({
        endpoint: endpoint,
        port: port
      });

      // Connect server
      await this.server.connect(this.transport);

      // Start HTTP server
      await this.transport.startServer();

      console.log(`[${new Date().toISOString()}] MiniMax MCP REST server started at: http://localhost:${port}${endpoint}`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to start REST server:`, error);
      throw error;
    }
  }

  /**
   * Stop REST server
   */
  public async stop(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
        console.log(`[${new Date().toISOString()}] REST server stopped`);
      }
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Failed to stop REST server:`, error);
      throw error;
    }
  }

  /**
   * Get MCP server instance
   */
  public getMCPServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Get server instance
   */
  public getServer(): Server {
    return this.server;
  }

  /**
   * Get current configuration
   */
  public getConfig(): Config {
    return this.config;
  }

  /**
   * Wrap error message
   * @param message Error message prefix
   * @param error Original error
   * @returns Wrapped error
   */
  private wrapError(message: string, error: unknown): Error {
    if (error instanceof Error) {
      const wrappedError = new Error(`${message}: ${error.message}`);
      wrappedError.stack = error.stack;
      return wrappedError;
    }
    return new Error(`${message}: ${String(error)}`);
  }
}
