import { MiniMaxAPI } from '../utils/api.js';
import { ImageGenerationRequest } from '../types/index.js';
import { MinimaxRequestError } from '../exceptions/index.js';
import { DEFAULT_T2I_MODEL, ERROR_PROMPT_REQUIRED, RESOURCE_MODE_URL, VALID_IMAGE_MODELS } from '../const/index.js';
import * as path from 'path';
import * as fs from 'fs';
import { buildOutputFile } from '../utils/file.js';
import * as requests from 'axios';

export class ImageAPI {
  private api: MiniMaxAPI;

  constructor(api: MiniMaxAPI) {
    this.api = api;
  }

  async generateImage(request: ImageGenerationRequest): Promise<string[]> {
    // Validate required parameters
    if (!request.prompt || request.prompt.trim() === '') {
      throw new MinimaxRequestError(ERROR_PROMPT_REQUIRED);
    }

    // Validate model
    const model = this.ensureValidModel(request.model);

    // Prepare request data
    const requestData: Record<string, any> = {
      model: model,
      prompt: request.prompt,
      aspect_ratio: request.aspectRatio || '1:1',
      n: request.n || 1,
      prompt_optimizer: request.promptOptimizer !== undefined ? request.promptOptimizer : true
    };

    // Only add subject reference if provided
    if (request.subjectReference) {
      // Check if it's a URL
      if (!request.subjectReference.startsWith(('http://')) &&
          !request.subjectReference.startsWith(('https://')) &&
          !request.subjectReference.startsWith(('data:'))) {
        // If it's a local file, process it as a data URL
        if (!fs.existsSync(request.subjectReference)) {
          throw new MinimaxRequestError(`Reference image file does not exist: ${request.subjectReference}`);
        }

        const imageData = fs.readFileSync(request.subjectReference);
        const base64Image = imageData.toString('base64');
        requestData.subject_reference = `data:image/jpeg;base64,${base64Image}`;
      } else {
        requestData.subject_reference = request.subjectReference;
      }
    }

    // Send request
    const response = await this.api.post<any>('/v1/image_generation', requestData);

    // Check response structure
    const imageUrls = response?.data?.image_urls;
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      throw new MinimaxRequestError('Unable to get image URLs from response');
    }

    // If URL mode, return URLs directly
    const resourceMode = this.api.getResourceMode();
    if (resourceMode === RESOURCE_MODE_URL) {
      return imageUrls;
    }

    // Process output files
    const outputFiles: string[] = [];
    const outputDir = request.outputDirectory;

    for (let i = 0; i < imageUrls.length; i++) {
      // Generate output filename - similar to Python version
      const outputFileName = buildOutputFile(`image_${i}_${request.prompt.substring(0, 20)}`, outputDir, 'jpg', true);

      try {
        // Download image
        const imageResponse = await requests.default.get(imageUrls[i], { responseType: 'arraybuffer' });

        // Ensure directory exists
        const dirPath = path.dirname(outputFileName);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        // Save file
        fs.writeFileSync(outputFileName, Buffer.from(imageResponse.data));
        outputFiles.push(outputFileName);
      } catch (error) {
        throw new MinimaxRequestError(`Failed to download or save image: ${String(error)}`);
      }
    }

    return outputFiles;
  }

  // Helper function to validate model
  private ensureValidModel(model?: string): string {
    // Use default model if not provided
    if (!model) {
      return DEFAULT_T2I_MODEL;
    }

    // Validate if model is valid
    if (!VALID_IMAGE_MODELS.includes(model)) {
      // console.error(`Warning: Provided image model ${model} is invalid, using default value ${DEFAULT_T2I_MODEL}`);
      return DEFAULT_T2I_MODEL;
    }

    return model;
  }
}
