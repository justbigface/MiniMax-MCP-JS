#!/usr/bin/env node

import { MCPServer } from './mcp-server.js';
import { MCPSSEServer } from './mcp-sse-server.js';
import { MCPRestServer } from './mcp-rest-server.js';
import { Config } from './types/index.js';
import { ConfigManager } from './config/ConfigManager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  DEFAULT_TRANSPORT_MODE,
  TRANSPORT_MODE_REST,
  TRANSPORT_MODE_SSE,
  TRANSPORT_MODE_STDIO,
} from './const/index.js';

/**
 * Get current version number
 * @returns Version string
 */
function getVersion(): string {
  try {
    // Get project root directory
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const packageJsonPath = path.resolve(__dirname, '../package.json');
    
    // Read package.json
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    return packageJson.version || 'Unknown version';
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to get version info:`, error);
    return 'Unknown version';
  }
}

/**
 * Check for special command line arguments
 * @returns Whether to continue normal startup
 */
function checkSpecialArgs(): boolean {
  // Check if version info is requested
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    const version = getVersion();
    console.log(`minimax-mcp-js version: ${version}`);
    return false;
  }
  
  return true;
}

/**
 * Start MiniMax MCP server
 * @param customConfig Custom configuration
 * @returns Promise to start server
 */
export async function startMiniMaxMCP(customConfig?: Partial<Config>): Promise<void> {
  try {
    // Use ConfigManager to get complete configuration, merging various config sources by priority
    const config = ConfigManager.getConfig(customConfig);

    // Get transport mode
    const transportMode = config.server?.mode || DEFAULT_TRANSPORT_MODE;
    console.log(`[${new Date().toISOString()}] Using transport mode: ${transportMode}`);

    // Choose server type based on transport mode
    switch (transportMode) {
      case TRANSPORT_MODE_REST:
        console.log(`[${new Date().toISOString()}] Starting REST server`);
        const restServer = new MCPRestServer(config);
        return restServer.start();

      case TRANSPORT_MODE_SSE:
        console.log(`[${new Date().toISOString()}] Starting SSE server`);
        const sseServer = new MCPSSEServer(config);
        return sseServer.start();

      case TRANSPORT_MODE_STDIO:
        console.log(`[${new Date().toISOString()}] Starting STDIO server`);
        const stdioServer = new MCPServer(config);
        return stdioServer.start();

      default:
        console.warn(`[${new Date().toISOString()}] Unknown transport mode: ${transportMode}, using default stdio mode`);
        const defaultServer = new MCPServer(config);
        return defaultServer.start();
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to start server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

// Direct script execution, check if it's the main module (ES module way)
// In ES modules, compare import.meta.url with process.argv[1] to determine if it's the main module
const isMainModule = () => {
  try {
    const mainPath = fileURLToPath(import.meta.url);
    return process.argv[1] === mainPath || process.argv[1] === mainPath.replace(/\.ts$/, '.js');
  } catch (error) {
    return false;
  }
};

if (isMainModule()) {
  // Check special command line arguments, like --version
  if (!checkSpecialArgs()) {
    process.exit(0);
  }
  
  // Print startup info and version
  const version = getVersion();
  console.log(`[${new Date().toISOString()}] Starting minimax-mcp-js v${version}`);
  
  startMiniMaxMCP().catch((error) => {
    process.stderr.write(`[${new Date().toISOString()}] Fatal error in main function: ${error}\n`);
    process.exit(1);
  });
}

// Export types and server classes for use in other projects
export * from './types/index.js';
export * from './utils/api.js';
export * from './api/tts.js';
export * from './api/image.js';
export * from './api/video.js';
export * from './api/voice-clone.js';
export * from './api/voice.js';
export * from './exceptions/index.js';
export * from './const/index.js';
export { MCPServer } from './mcp-server.js';
export { MCPSSEServer } from './mcp-sse-server.js';
export { MCPRestServer } from './mcp-rest-server.js';
export { ConfigManager } from './config/ConfigManager.js';
