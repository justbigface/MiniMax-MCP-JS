#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { Config, ServerOptions, TransportMode } from './types/index.js';
import { MiniMaxAPI } from './utils/api.js';
import { TTSAPI } from './api/tts.js';
import { ImageAPI } from './api/image.js';
import { VideoAPI } from './api/video.js';
import { VoiceCloneAPI } from './api/voice-clone.js';
import { VoiceAPI } from './api/voice.js';
import { playAudio } from './utils/audio.js';
import express from 'express';
import cors from 'cors';
import { RestServerTransport } from '@chatmcp/sdk/server/rest.js';
import { getParamValue } from '@chatmcp/sdk/utils/index.js';
import {
  DEFAULT_API_HOST,
  DEFAULT_BITRATE,
  DEFAULT_CHANNEL,
  DEFAULT_EMOTION,
  DEFAULT_FORMAT,
  DEFAULT_LANGUAGE_BOOST,
  DEFAULT_PITCH,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_SERVER_ENDPOINT,
  DEFAULT_SERVER_PORT,
  DEFAULT_SPEECH_MODEL,
  DEFAULT_SPEED,
  DEFAULT_T2I_MODEL,
  DEFAULT_T2V_MODEL,
  DEFAULT_TRANSPORT_MODE,
  DEFAULT_VOICE_ID,
  DEFAULT_VOLUME,
  ENV_MINIMAX_API_HOST,
  ENV_MINIMAX_API_KEY,
  ENV_MINIMAX_MCP_BASE_PATH,
  ENV_RESOURCE_MODE,
  ENV_SERVER_ENDPOINT,
  ENV_SERVER_PORT,
  ENV_TRANSPORT_MODE,
  ENV_CONFIG_PATH,
  ERROR_API_HOST_REQUIRED,
  ERROR_API_KEY_REQUIRED,
  RESOURCE_MODE_URL,
  TRANSPORT_MODE_REST,
  TRANSPORT_MODE_SSE,
  TRANSPORT_MODE_STDIO,
} from './const/index.js';
import fs from 'fs';

// Get common parameters, prioritize using parameter values
const apiKey = getParamValue('api_key') || process.env[ENV_MINIMAX_API_KEY] || '';
const basePath = getParamValue('base_path') || process.env[ENV_MINIMAX_MCP_BASE_PATH];
const apiHost = getParamValue('api_host') || process.env[ENV_MINIMAX_API_HOST] || DEFAULT_API_HOST;
const resourceMode = getParamValue('resource_mode') || process.env[ENV_RESOURCE_MODE] || RESOURCE_MODE_URL;

// Get server parameters, prioritize using parameter values
const transportMode = getParamValue('mode') || process.env[ENV_TRANSPORT_MODE] || DEFAULT_TRANSPORT_MODE;
const serverPort = getParamValue('port')
  ? parseInt(getParamValue('port'), 10)
  : process.env[ENV_SERVER_PORT]
    ? parseInt(process.env[ENV_SERVER_PORT], 10)
    : DEFAULT_SERVER_PORT;
const serverEndpoint = getParamValue('endpoint') || process.env[ENV_SERVER_ENDPOINT] || DEFAULT_SERVER_ENDPOINT;

// Initialize default configuration from parameters and environment variables
const defaultConfig: Config = {
  apiKey,
  basePath,
  apiHost,
  resourceMode,
  server: {
    mode: transportMode as TransportMode,
    port: serverPort,
    endpoint: serverEndpoint,
  },
};

// Helper function to extract configuration values from an object
function getAuthValue(name: string, auth?: Record<string, any>, defaultValue: string = ''): string {
  // Try to get value, handle different naming formats
  if (auth) {
    // Get value, support different naming formats
    const value = auth[name] || auth[name.toUpperCase()] || auth[name.toLowerCase()];
    if (value) return value;
  }

  // Return default value
  return defaultValue;
}

// Create configuration object, initially using default configuration
let config: Config = { ...defaultConfig };

// Create API instances
let api = new MiniMaxAPI(config);
let ttsApi = new TTSAPI(api);
let imageApi = new ImageAPI(api);
let videoApi = new VideoAPI(api);
let voiceCloneApi = new VoiceCloneAPI(api);
let voiceApi = new VoiceAPI(api);

// Create server instance
const server = new McpServer({
  name: 'minimax-mcp-js',
  version: '1.0.0',
});

// Register TTS tool
server.tool(
  'text_to_audio',
  'Convert text to audio with a given voice and save the output audio file to a given directory. If no directory is provided, the file will be saved to desktop. If no voice ID is provided, the default voice will be used.\n\nNote: This tool calls MiniMax API and may incur costs. Use only when explicitly requested by the user.',
  {
    text: z.string().describe('Text to convert to audio'),
    outputDirectory: z.string().optional().describe('Directory to save the output file'),
    voiceId: z.string().optional().default(DEFAULT_VOICE_ID).describe('Voice ID to use, e.g. "female-shaonv"'),
    model: z.string().optional().default(DEFAULT_SPEECH_MODEL).describe('Model to use'),
    speed: z.number().min(0.5).max(2.0).optional().default(DEFAULT_SPEED).describe('Speech speed'),
    vol: z.number().min(0.1).max(10.0).optional().default(DEFAULT_VOLUME).describe('Speech volume'),
    pitch: z.number().min(-12).max(12).optional().default(DEFAULT_PITCH).describe('Speech pitch'),
    emotion: z
      .string()
      .optional()
      .default(DEFAULT_EMOTION)
      .describe('Speech emotion, values: ["happy", "sad", "angry", "fearful", "disgusted", "surprised", "neutral"]'),
    format: z
      .string()
      .optional()
      .default(DEFAULT_FORMAT)
      .describe('Audio format, values: ["pcm", "mp3","flac", "wav"]'),
    sampleRate: z
      .number()
      .optional()
      .default(DEFAULT_SAMPLE_RATE)
      .describe('Sample rate (Hz), values: [8000, 16000, 22050, 24000, 32000, 44100]'),
    bitrate: z
      .number()
      .optional()
      .default(DEFAULT_BITRATE)
      .describe('Bitrate (bps), values: [64000, 96000, 128000, 160000, 192000, 224000, 256000, 320000]'),
    channel: z.number().optional().default(DEFAULT_CHANNEL).describe('Audio channels, values: [1, 2]'),
    languageBoost: z.string().optional().default(DEFAULT_LANGUAGE_BOOST).describe('Language boost'),
    outputFile: z
      .string()
      .optional()
      .describe('Path to save the generated audio file, automatically generated if not provided'),
  },
  async (args, extra) => {
    try {
      // Build TTS request parameters
      const ttsParams = {
        text: args.text,
        outputDirectory: args.outputDirectory,
        voiceId: args.voiceId || DEFAULT_VOICE_ID,
        model: args.model || DEFAULT_SPEECH_MODEL,
        speed: args.speed || DEFAULT_SPEED,
        vol: args.vol || DEFAULT_VOLUME,
        pitch: args.pitch || DEFAULT_PITCH,
        emotion: args.emotion || DEFAULT_EMOTION,
        format: args.format || DEFAULT_FORMAT,
        sampleRate: args.sampleRate || DEFAULT_SAMPLE_RATE,
        bitrate: args.bitrate || DEFAULT_BITRATE,
        channel: args.channel || DEFAULT_CHANNEL,
        languageBoost: args.languageBoost || DEFAULT_LANGUAGE_BOOST,
        outputFile: args.outputFile,
      };

      // Use global configuration
      const requestApiKey = config.apiKey;

      if (!requestApiKey) {
        throw new Error(ERROR_API_KEY_REQUIRED);
      }

      // Update configuration with request-specific parameters
      const requestConfig: Partial<Config> = {
        apiKey: requestApiKey,
        apiHost: config.apiHost,
        resourceMode: config.resourceMode,
      };

      // Update API instance
      const requestApi = new MiniMaxAPI(requestConfig as Config);
      const requestTtsApi = new TTSAPI(requestApi);

      // Auto-set resource mode if not specified
      const outputFormat = requestConfig.resourceMode;
      const ttsRequest = {
        ...ttsParams,
        outputFormat,
      };

      // Auto-generate output filename if not provided
      if (!ttsRequest.outputFile) {
        const textPrefix = ttsRequest.text.substring(0, 20).replace(/[^\w]/g, '_');
        ttsRequest.outputFile = `tts_${textPrefix}_${Date.now()}`;
      }

      const result = await requestTtsApi.generateSpeech(ttsRequest);

      // Return different messages based on output format
      if (outputFormat === RESOURCE_MODE_URL) {
        return {
          content: [
            {
              type: 'text',
              text: `Success. Audio URL: ${result}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Audio file saved: ${result}. Voice used: ${ttsParams.voiceId}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to generate audio: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Register list voices tool
server.tool(
  'list_voices',
  'List all available voices. Only supported when api_host is https://api.minimax.chat.',
  {
    voiceType: z
      .string()
      .optional()
      .default('all')
      .describe('Type of voices to list, values: ["all", "system", "voice_cloning"]'),
  },
  async (params) => {
    try {
      // Try to update configuration from request parameters
      updateConfigFromRequest(params);

      const result = await voiceApi.listVoices(params);

      return {
        content: [
          {
            type: 'text',
            text: `Success. System voices: ${result.systemVoices.join(', ')}, Cloned voices: ${result.voiceCloneVoices.join(', ')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to list voices: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Register play audio tool
server.tool(
  'play_audio',
  'Play an audio file. Supports WAV and MP3 formats. Does not support video.',
  {
    inputFilePath: z.string().describe('Path to the audio file to play'),
    isUrl: z.boolean().optional().default(false).describe('Whether the audio file is a URL'),
  },
  async (params) => {
    try {
      // Try to update configuration from request parameters
      updateConfigFromRequest(params);

      const result = await playAudio(params);

      return {
        content: [
          {
            type: 'text',
            text: result,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to play audio: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Register text to image tool
server.tool(
  'text_to_image',
  'Generate images based on text prompts.\n\nNote: This tool calls MiniMax API and may incur costs. Use only when explicitly requested by the user.',
  {
    model: z.string().optional().default(DEFAULT_T2I_MODEL).describe('Model to use'),
    prompt: z.string().describe('Text prompt for image generation'),
    aspectRatio: z
      .string()
      .optional()
      .default('1:1')
      .describe('Image aspect ratio, values: ["1:1", "16:9","4:3", "3:2", "2:3", "3:4", "9:16", "21:9"]'),
    n: z.number().min(1).max(9).optional().default(1).describe('Number of images to generate'),
    promptOptimizer: z.boolean().optional().default(true).describe('Whether to optimize the prompt'),
    outputDirectory: z.string().optional().describe('Directory to save the output file'),
    outputFile: z
      .string()
      .optional()
      .describe('Path to save the generated image file, automatically generated if not provided'),
  },
  async (params) => {
    try {
      // Try to update configuration from request parameters
      updateConfigFromRequest(params);

      // Auto-generate output filename if not provided
      if (!params.outputFile) {
        const promptPrefix = params.prompt.substring(0, 20).replace(/[^\w]/g, '_');
        params.outputFile = `image_${promptPrefix}_${Date.now()}`;
      }

      const outputFiles = await imageApi.generateImage(params);

      // Handle different output formats
      if (config.resourceMode === RESOURCE_MODE_URL) {
        return {
          content: [
            {
              type: 'text',
              text: `Success. Image URL(s): ${outputFiles.join(', ')}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Image(s) saved: ${outputFiles.join(', ')}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to generate image: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Register generate video tool
server.tool(
  'generate_video',
  'Generate a video based on text prompts.\n\nNote: This tool calls MiniMax API and may incur costs. Use only when explicitly requested by the user.',
  {
    model: z
      .string()
      .optional()
      .default(DEFAULT_T2V_MODEL)
      .describe('Model to use, values: ["T2V-01", "T2V-01-Director", "I2V-01", "I2V-01-Director", "I2V-01-live"]'),
    prompt: z.string().describe('Text prompt for video generation'),
    firstFrameImage: z.string().optional().describe('First frame image'),
    outputDirectory: z.string().optional().describe('Directory to save the output file'),
    outputFile: z
      .string()
      .optional()
      .describe('Path to save the generated video file, automatically generated if not provided'),
  },
  async (params) => {
    try {
      // Try to update configuration from request parameters
      updateConfigFromRequest(params);

      // Auto-generate output filename if not provided
      if (!params.outputFile) {
        const promptPrefix = params.prompt.substring(0, 20).replace(/[^\w]/g, '_');
        params.outputFile = `video_${promptPrefix}_${Date.now()}`;
      }

      const result = await videoApi.generateVideo(params);

      // Handle different output formats
      if (config.resourceMode === RESOURCE_MODE_URL) {
        return {
          content: [
            {
              type: 'text',
              text: `Success. Video URL: ${result}`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text',
              text: `Video saved: ${result}`,
            },
          ],
        };
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Failed to generate video: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Register voice cloning tool
server.tool(
  'voice_clone',
  'Clone a voice using the provided audio file. New voices will incur costs when first used.\n\nNote: This tool calls MiniMax API and may incur costs. Use only when explicitly requested by the user.',
  {
    voiceId: z.string().describe('Voice ID to use'),
    audioFile: z.string().describe('Path to the audio file'),
    text: z.string().optional().describe('Text for the demo audio'),
    outputDirectory: z.string().optional().describe('Directory to save the output file'),
    isUrl: z.boolean().optional().default(false).describe('Whether the audio file is a URL'),
  },
  async (params) => {
    try {
      // Try to update configuration from request parameters
      updateConfigFromRequest(params);

      const result = await voiceCloneApi.cloneVoice(params);

      return {
        content: [
          {
            type: 'text',
            text: `Voice cloning successful: ${result}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Voice cloning failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  },
);

// Get configuration from command line arguments
function getConfigFromCommandLine(): Partial<Config> | undefined {
  const args = process.argv.slice(2);
  const config: Partial<Config> = {};
  const serverConfig: Partial<ServerOptions> = {};
  let hasServerConfig = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--api-key' && i + 1 < args.length) {
      config.apiKey = args[++i];
    } else if (arg === '--api-host' && i + 1 < args.length) {
      config.apiHost = args[++i];
    } else if (arg === '--base-path' && i + 1 < args.length) {
      config.basePath = args[++i];
    } else if (arg === '--resource-mode' && i + 1 < args.length) {
      config.resourceMode = args[++i];
    } else if (arg === '--mode' && i + 1 < args.length) {
      serverConfig.mode = args[++i] as any;
      hasServerConfig = true;
    } else if (arg === '--port' && i + 1 < args.length) {
      serverConfig.port = parseInt(args[++i], 10);
      hasServerConfig = true;
    } else if (arg === '--endpoint' && i + 1 < args.length) {
      serverConfig.endpoint = args[++i];
      hasServerConfig = true;
    }
  }

  if (hasServerConfig) {
    config.server = serverConfig;
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

// Update configuration and recreate API instances
function updateConfig(newConfig: Partial<Config>): void {
  // Merge server configuration
  if (newConfig.server && config.server) {
    // New configuration has higher priority and should override existing configuration
    config.server = {
      ...config.server, // Lower priority configuration loaded first
      ...newConfig.server // Higher priority configuration loaded last
    };
    delete newConfig.server;
  } else if (newConfig.server) {
    config.server = newConfig.server;
    delete newConfig.server;
  }

  // Merge other configurations, new configuration has higher priority
  config = {
    ...config, // Lower priority configuration loaded first
    ...newConfig // Higher priority configuration loaded last
  };

  // Update API instances
  api = new MiniMaxAPI(config);
  ttsApi = new TTSAPI(api);
  imageApi = new ImageAPI(api);
  videoApi = new VideoAPI(api);
  voiceCloneApi = new VoiceCloneAPI(api);
  voiceApi = new VoiceAPI(api);
}

// Read configuration from file
function getConfigFromFile(): Partial<Config> | undefined {
  try {
    // Prioritize getting configuration file path from parameters
    const configPath = getParamValue("config_path") || process.env[ENV_CONFIG_PATH] || './minimax-config.json';

    // Check if file exists
    if (!fs.existsSync(configPath)) {
      return undefined;
    }

    // Read and parse configuration file
    const fileContent = fs.readFileSync(configPath, 'utf8');
    const fileConfig = JSON.parse(fileContent) as Partial<Config>;

    return fileConfig;
  } catch (error) {
    console.warn(`Failed to read config file: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

// Start REST server
async function startRestServer() {
  try {
    // Use REST server implementation
    const port = config.server?.port || DEFAULT_SERVER_PORT;
    const endpoint = config.server?.endpoint || DEFAULT_SERVER_ENDPOINT;

    console.log(`Starting REST server on port ${port} with endpoint ${endpoint}`);

    const transport = new RestServerTransport({
      port,
      endpoint,
    });

    await server.connect(transport);
    await transport.startServer();

    console.log(`MiniMax MCP Server running on REST with port ${port} and endpoint ${endpoint}`);
  } catch (error) {
    console.error(`Failed to start REST server: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Start SSE server
async function startSSEServer() {
  try {
    // Use SSE implementation from @modelcontextprotocol/sdk
    const app = express();
    const port = config.server?.port || DEFAULT_SERVER_PORT;
    const endpoint = config.server?.endpoint || DEFAULT_SERVER_ENDPOINT;

    // Configure CORS and JSON parsing
    app.use(cors());
    app.use(express.json());

    let transport: any = null;

    // Configure SSE route
    app.get('/sse', (req: any, res: any) => {
      console.log('New SSE connection');
      transport = new SSEServerTransport(endpoint, res);
      server.connect(transport);
    });

    // Configure message handling route
    app.post(endpoint, (req: any, res: any) => {
      if (transport) {
        transport.handlePostMessage(req, res);
      } else {
        res.status(400).json({ error: 'No SSE connection established' });
      }
    });

    // Start Express server
    app.listen(port, () => {
      console.log(`MiniMax MCP Server running on SSE with port ${port}`);
    });
  } catch (error) {
    console.error(`Failed to start SSE server: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

// Start the server
async function runServer() {
  try {
    // Configuration priority from high to low:
    // 1. Request-level configuration (meta.auth parameters) - handled during API calls
    // 2. Command line arguments
    // 3. Environment variables
    // 4. Configuration file
    // 5. Default values
    
    // Environment variables and default values have already been loaded during default configuration initialization
    
    // Get configuration from configuration file (lower priority than environment variables)
    const fileConfig = getConfigFromFile();
    if (fileConfig) {
      // Note: Since environment variables have already been loaded into config during initialization,
      // special handling is needed here to avoid configuration file overriding environment variable settings
      const configWithEnv = { ...fileConfig };
      
      // If environment variables are set, don't use corresponding settings from configuration file
      if (process.env[ENV_MINIMAX_API_KEY]) {
        delete configWithEnv.apiKey;
      }
      if (process.env[ENV_MINIMAX_API_HOST]) {
        delete configWithEnv.apiHost;
      }
      if (process.env[ENV_MINIMAX_MCP_BASE_PATH]) {
        delete configWithEnv.basePath;
      }
      if (process.env[ENV_RESOURCE_MODE]) {
        delete configWithEnv.resourceMode;
      }
      if (configWithEnv.server) {
        if (process.env[ENV_TRANSPORT_MODE]) {
          delete configWithEnv.server.mode;
        }
        if (process.env[ENV_SERVER_PORT]) {
          delete configWithEnv.server.port;
        }
        if (process.env[ENV_SERVER_ENDPOINT]) {
          delete configWithEnv.server.endpoint;
        }
      }
      
      // Apply filtered configuration file settings
      updateConfig(configWithEnv);
    }
    
    // Get configuration from command line (higher priority than configuration file and environment variables)
    const cmdConfig = getConfigFromCommandLine();
    if (cmdConfig) {
      updateConfig(cmdConfig);
    }
    
    // Request-level configuration is dynamically loaded during each request processing (highest priority)
    
    // Validate necessary configuration
    if (!config.apiKey) {
      throw new Error(ERROR_API_KEY_REQUIRED);
    }

    if (!config.apiHost) {
      throw new Error(ERROR_API_HOST_REQUIRED);
    }

    // Check mode parameter
    const mode = config.server?.mode || DEFAULT_TRANSPORT_MODE;

    // If REST mode, use RESTServerTransport
    if (mode === TRANSPORT_MODE_REST) {
      const port = config.server?.port || DEFAULT_SERVER_PORT;
      const endpoint = config.server?.endpoint || DEFAULT_SERVER_ENDPOINT;

      console.log(`Starting REST server on port ${port} with endpoint ${endpoint}`);

      const transport = new RestServerTransport({
        port,
        endpoint,
      });

      await server.connect(transport);
      await transport.startServer();

      console.log(`MiniMax MCP Server running on REST with port ${port} and endpoint ${endpoint}`);
      return;
    }

    // If SSE mode
    if (mode === TRANSPORT_MODE_SSE) {
      const app = express();
      const port = config.server?.port || DEFAULT_SERVER_PORT;
      const endpoint = config.server?.endpoint || DEFAULT_SERVER_ENDPOINT;

      // Configure CORS and JSON parsing
      app.use(cors());
      app.use(express.json());

      let transport: any = null;

      // Configure SSE route
      app.get('/sse', (req: any, res: any) => {
        console.log('New SSE connection');
        transport = new SSEServerTransport(endpoint, res);
        server.connect(transport);
      });

      // Configure message handling route
      app.post(endpoint, (req: any, res: any) => {
        if (transport) {
          transport.handlePostMessage(req, res);
        } else {
          res.status(400).json({ error: 'No SSE connection established' });
        }
      });

      // Start Express server
      app.listen(port, () => {
        console.log(`MiniMax MCP Server running on SSE with port ${port}`);
      });
      return;
    }

    // Default to stdio mode
    console.log('Starting stdio server');
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.log('MiniMax MCP Server running on stdio');
  } catch (error) {
    console.error(`Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

/**
 * Start the MiniMax MCP server
 * @param customConfig Custom configuration
 * @returns Promise to start the server
 */
export async function startMiniMaxMCP(customConfig?: Partial<Config>): Promise<void> {
  if (customConfig) {
    updateConfig(customConfig);
  }
  return runServer();
}

// Run script directly
runServer().catch((error) => {
  process.stderr.write(`Fatal error in main function: ${error}\n`);
  process.exit(1);
});

// Export types and API instances for use in other projects
export {
  Config,
  TTSRequest,
  ImageGenerationRequest,
  VideoGenerationRequest,
  VoiceCloneRequest,
  ListVoicesRequest,
  PlayAudioRequest,
  ServerOptions,
  TransportMode,
} from './types/index.js';
export { MiniMaxAPI } from './utils/api.js';
export { TTSAPI } from './api/tts.js';
export { ImageAPI } from './api/image.js';
export { VideoAPI } from './api/video.js';
export { VoiceCloneAPI } from './api/voice-clone.js';
export { VoiceAPI } from './api/voice.js';
export * from './exceptions/index.js';
export * from './const/index.js';

// Function to get configuration from request
function getConfigFromRequest(request: any): Partial<Config> | undefined {
  // Try to get configuration from meta.auth field in request parameters
  const auth = request?.params?.meta?.auth;

  if (!auth || typeof auth !== 'object' || Object.keys(auth).length === 0) {
    return undefined;
  }

  // Build configuration object including server settings
  const serverConfig: Partial<ServerOptions> = {
    mode: (getAuthValue('transport_mode', auth) || getAuthValue('transportMode', auth)) as TransportMode | undefined,
    port: getAuthValue('port', auth) ? parseInt(getAuthValue('port', auth), 10) : undefined,
    endpoint: getAuthValue('endpoint', auth),
  };

  // Build configuration object
  const config: Partial<Config> = {
    apiKey: getAuthValue('api_key', auth) || getAuthValue('apiKey', auth),
    basePath: getAuthValue('base_path', auth) || getAuthValue('basePath', auth),
    apiHost: getAuthValue('api_host', auth) || getAuthValue('apiHost', auth),
    resourceMode: getAuthValue('resource_mode', auth) || getAuthValue('resourceMode', auth),
  };

  // Only add server configuration when at least one server config value exists
  if (serverConfig.mode || serverConfig.port || serverConfig.endpoint) {
    config.server = serverConfig;
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

// Update configuration from request
function updateConfigFromRequest(params: any): void {
  // In MCP tools, request parameters are passed directly as the first argument
  // Try to get configuration from params.meta.auth
  if (params?.meta?.auth) {
    const requestConfig = getConfigFromRequest({ params });
    if (requestConfig) {
      updateConfig(requestConfig);
    }
  }
}
