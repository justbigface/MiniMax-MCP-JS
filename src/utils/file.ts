import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { MinimaxResourceError } from '../exceptions/index.js';

/**
 * Build output path
 * @param dir Output directory
 * @returns Complete path
 */
export function buildOutputPath(dir?: string): string {
  // If no directory is provided, use desktop path
  if (!dir) {
    const desktopPath = path.join(os.homedir(), 'Desktop');
    return desktopPath;
  }

  // Handle relative or absolute path
  const outputPath = path.isAbsolute(dir)
    ? dir
    : path.join(process.cwd(), dir);

  // Ensure directory exists
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
  const outputPath = buildOutputPath(dir);

  // Handle random suffix
  if (useRandomSuffix) {
    const randomId = Math.random().toString(36).substring(2, 8);
    filename = `${filename}_${randomId}`;
  }

  if (ext && !filename.endsWith(`.${ext}`)) {
    filename = `${filename}.${ext}`;
  }

  return path.join(outputPath, filename);
}

/**
 * Process input file, check if it exists
 * @param filePath File path
 * @returns Complete file path
 */
export function processInputFile(filePath: string): string {
  const normalizedPath = path.normalize(filePath);

  // Check if file exists
  if (!fs.existsSync(normalizedPath)) {
    throw new MinimaxResourceError(`File does not exist: ${normalizedPath}`);
  }

  // Check if it's a file
  if (!fs.statSync(normalizedPath).isFile()) {
    throw new MinimaxResourceError(`Not a file: ${normalizedPath}`);
  }

  return normalizedPath;
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
