#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { Config } from './types/index.js';
import { MiniMaxAPI } from './utils/api.js';
import { TTSAPI } from './api/tts.js';
import { ImageAPI } from './api/image.js';
import { VideoAPI } from './api/video.js';
import { VoiceCloneAPI } from './api/voice-clone.js';
import { VoiceAPI } from './api/voice.js';
import { playAudio } from './utils/audio.js';
import {
  DEFAULT_API_HOST,
  DEFAULT_BITRATE,
  DEFAULT_CHANNEL,
  DEFAULT_EMOTION,
  DEFAULT_FORMAT,
  DEFAULT_LANGUAGE_BOOST,
  DEFAULT_PITCH,
  DEFAULT_SAMPLE_RATE,
  DEFAULT_SPEECH_MODEL,
  DEFAULT_SPEED,
  DEFAULT_T2I_MODEL,
  DEFAULT_T2V_MODEL,
  DEFAULT_VOICE_ID,
  DEFAULT_VOLUME,
  ENV_MINIMAX_API_HOST,
  ENV_MINIMAX_API_KEY,
  ENV_MINIMAX_MCP_BASE_PATH,
  ENV_RESOURCE_MODE,
  ERROR_API_HOST_REQUIRED,
  ERROR_API_KEY_REQUIRED,
  RESOURCE_MODE_URL,
} from './const/index.js';

// Initialize default configuration from environment variables
const defaultConfig: Config = {
  apiKey: process.env[ENV_MINIMAX_API_KEY] || '',
  basePath: process.env[ENV_MINIMAX_MCP_BASE_PATH],
  apiHost: process.env[ENV_MINIMAX_API_HOST] || DEFAULT_API_HOST,
  resourceMode: process.env[ENV_RESOURCE_MODE] || RESOURCE_MODE_URL,
};

// Helper function to extract configuration values from an object
function getAuthValue(name: string, auth?: Record<string, any>, defaultValue: string = ''): string {
  if (auth) {
    // Try various naming formats to get values from the auth object
    const value = auth[name] || auth[name.toUpperCase()] || auth[name.toLowerCase()];

    if (value) return value;
  }

  // Fall back to default value
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
  async (params) => {
    try {
      // Try to update configuration from request parameters
      updateConfigFromRequest(params);

      // Auto-set resource mode if not specified
      const outputFormat = config.resourceMode;
      const ttsRequest = {
        ...params,
        outputFormat,
      };

      // Auto-generate output filename if not provided
      if (!ttsRequest.outputFile) {
        const textPrefix = ttsRequest.text.substring(0, 20).replace(/[^\w]/g, '_');
        ttsRequest.outputFile = `tts_${textPrefix}_${Date.now()}`;
      }

      const result = await ttsApi.generateSpeech(ttsRequest);

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
              text: `Audio file saved: ${result}. Voice used: ${params.voiceId}`,
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
    }
  }

  return Object.keys(config).length > 0 ? config : undefined;
}

// Update configuration and recreate API instances
function updateConfig(newConfig: Partial<Config>): void {
  // Merge configurations, new configuration takes priority
  config = { ...defaultConfig, ...newConfig };

  // Update API instances
  api = new MiniMaxAPI(config);
  ttsApi = new TTSAPI(api);
  imageApi = new ImageAPI(api);
  videoApi = new VideoAPI(api);
  voiceCloneApi = new VoiceCloneAPI(api);
  voiceApi = new VoiceAPI(api);
}

// Start the server
async function main() {
  try {
    // 1. Check command line arguments
    const cmdConfig = getConfigFromCommandLine();
    if (cmdConfig) {
      updateConfig(cmdConfig);
    }

    // 2. Check configuration file (if exists)
    try {
      const configPath = process.env.MINIMAX_CONFIG_PATH || './minimax-config.json';
      const fs = await import('fs');
      if (fs.existsSync(configPath)) {
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (configData && typeof configData === 'object') {
          updateConfig(configData);
        }
      }
    } catch (err) {
      // Configuration file doesn't exist or is incorrectly formatted, ignore error
    }

    // Validate necessary configuration
    if (!config.apiKey) {
      throw new Error(ERROR_API_KEY_REQUIRED);
    }

    if (!config.apiHost) {
      throw new Error(ERROR_API_HOST_REQUIRED);
    }

    // Start the server
    const transport = new StdioServerTransport();
    await server.connect(transport);
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
  return main();
}

// Run script directly
main().catch((error) => {
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

  // Build configuration object
  return {
    apiKey: getAuthValue('api_key', auth) || getAuthValue('apiKey', auth),
    basePath: getAuthValue('base_path', auth) || getAuthValue('basePath', auth),
    apiHost: getAuthValue('api_host', auth) || getAuthValue('apiHost', auth),
    resourceMode: getAuthValue('resource_mode', auth) || getAuthValue('resourceMode', auth),
  };
}

// Update configuration from request
function updateConfigFromRequest(params: any): void {
  // In MCP tools, request parameters are passed directly as the first argument
  // Try to get configuration from params.meta.auth
  if (params?.meta?.auth) {
    const requestConfig = {
      apiKey: getAuthValue('api_key', params.meta.auth) || getAuthValue('apiKey', params.meta.auth),
      basePath: getAuthValue('base_path', params.meta.auth) || getAuthValue('basePath', params.meta.auth),
      apiHost: getAuthValue('api_host', params.meta.auth) || getAuthValue('apiHost', params.meta.auth),
      resourceMode: getAuthValue('resource_mode', params.meta.auth) || getAuthValue('resourceMode', params.meta.auth),
    };

    // Merge configurations, request configuration takes priority
    config = { ...defaultConfig, ...requestConfig };
    // Update API instances
    api = new MiniMaxAPI(config);
    ttsApi = new TTSAPI(api);
    imageApi = new ImageAPI(api);
    videoApi = new VideoAPI(api);
    voiceCloneApi = new VoiceCloneAPI(api);
    voiceApi = new VoiceAPI(api);
  }
}
