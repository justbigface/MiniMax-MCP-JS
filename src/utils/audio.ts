import { spawn } from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { PlayAudioRequest } from '../types/index.js';
import { MinimaxRequestError } from '../exceptions/index.js';
import { processInputFile } from './file.js';
import * as requests from 'axios';

/**
 * Play audio file
 * @param request Play request
 * @returns Success message
 */
export async function playAudio(request: PlayAudioRequest): Promise<string> {
  try {
    let data: Buffer;

    if (request.isUrl) {
      // If URL, download audio data
      const response = await requests.default.get(request.inputFilePath, { responseType: 'arraybuffer' });
      data = Buffer.from(response.data);
    } else {
      // If local file, read file
      const filePath = processInputFile(request.inputFilePath);
      data = fs.readFileSync(filePath);
    }

    // Save to temporary file
    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `audio_${Date.now()}.mp3`);
    fs.writeFileSync(tempFile, data);

    // Play audio based on operating system
    const platform = os.platform();
    let player;

    if (platform === 'darwin') {
      // macOS
      player = spawn('afplay', [tempFile]);
    } else if (platform === 'win32') {
      // Windows
      player = spawn('powershell', ['-c', `(New-Object Media.SoundPlayer "${tempFile}").PlaySync()`]);
    } else {
      // Linux/Unix
      player = spawn('play', [tempFile]);
    }

    // Wait for playback to complete
    return new Promise((resolve, reject) => {
      player.on('close', (code) => {
        // Delete temporary file
        fs.unlinkSync(tempFile);

        if (code === 0) {
          resolve(`Successfully played audio: ${request.inputFilePath}`);
        } else {
          reject(new Error(`Failed to play audio, error code: ${code}`));
        }
      });

      player.on('error', (err) => {
        // Delete temporary file
        try {
          fs.unlinkSync(tempFile);
        } catch (e) {
          // Ignore deletion failure
        }

        reject(new Error(`Failed to start audio player: ${err.message}`));
      });
    });
  } catch (error) {
    throw new MinimaxRequestError(`Failed to play audio: ${String(error)}`);
  }
}
