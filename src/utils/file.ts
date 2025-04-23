import * as path from 'path';
import * as fs from 'fs';
import { MinimaxResourceError } from '../exceptions/index.js';
import { ConfigManager } from '../config/ConfigManager.js';

const BASE_PATH = ConfigManager.getConfig().basePath!;

/**
 * Build output path
 * @param dir Output directory
 * @returns Complete path
 */
export function buildOutputPath(dir?: string): string {
  const outputPath = dir ? path.join(BASE_PATH, dir) : BASE_PATH;

  if (!fs.existsSync(outputPath)) {
    try {
      fs.mkdirSync(outputPath, { recursive: true });
    } catch (err) {
      throw new MinimaxResourceError(`Cannot create output directory: ${outputPath}`);
    }
  }

  return outputPath;
}

/**
 * Build complete output file path
 * @param filename Filename
 * @param dir Directory
 * @param ext Extension (without dot)
 * @param useRandomSuffix Whether to use random suffix
 * @returns Complete file path
 */
export function buildOutputFile(filename: string, dir?: string, ext?: string, useRandomSuffix?: boolean): string {
  if (useRandomSuffix) {
    const rnd = Math.random().toString(36).slice(2, 8);
    filename = `${filename}_${rnd}`;
  }

  if (ext && !filename.endsWith(`.${ext}`)) {
    filename = `${filename}.${ext}`;
  }

  const folder = buildOutputPath(dir);
  return path.join(folder, filename);
}

/**
 * Process input file, check if it exists
 * @param filePath File path
 * @returns Complete file path
 */
export function processInputFile(filePath: string): string {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(process.cwd(), filePath);

  const normalized = path.normalize(resolved);

  // Check if file exists
  if (!fs.existsSync(normalized)) {
    throw new MinimaxResourceError(`File does not exist: ${normalized}`);
  }

  // Check if it's a file
  if (!fs.statSync(normalized).isFile()) {
    throw new MinimaxResourceError(`Not a file: ${normalized}`);
  }

  return normalized;
}

/**
 * Generate timestamp filename
 * @param prefix Prefix
 * @param ext Extension (without dot)
 * @returns Timestamped filename
 */
export function generateTimestampFilename(prefix: string, ext: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${prefix}-${timestamp}.${ext}`;
}
