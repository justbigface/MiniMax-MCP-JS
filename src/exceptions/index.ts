import { AxiosError } from 'axios';

/**
 * Base error class for Minimax API errors
 */
export class MinimaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MinimaxError';
  }
}

/**
 * Error class for authentication issues
 */
export class MinimaxAuthError extends MinimaxError {
  constructor(message: string) {
    super(message);
    this.name = 'MinimaxAuthError';
  }
}

/**
 * Error class for request issues
 */
export class MinimaxRequestError extends MinimaxError {
  constructor(message: string) {
    super(message);
    this.name = 'MinimaxRequestError';
  }
}

/**
 * Error class for parameter issues
 */
export class MinimaxParameterError extends MinimaxError {
  constructor(message: string) {
    super(message);
    this.name = 'MinimaxParameterError';
  }
}

/**
 * Error class for resource issues (files, directories)
 */
export class MinimaxResourceError extends MinimaxError {
  constructor(message: string) {
    super(message);
    this.name = 'MinimaxResourceError';
  }
}

/**
 * Create an error from an Axios error
 * @param error Axios error
 * @returns Minimax error
 */
export function createApiErrorFromAxiosError(error: AxiosError): MinimaxError {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const status = error.response.status;
    const data = error.response.data as any;
    
    if (status === 401 || status === 403) {
      return new MinimaxAuthError(`Authentication error: ${data?.message || status}`);
    }
    
    return new MinimaxRequestError(`API Error (${status}): ${data?.message || 'Unknown error'}`);
  } else if (error.request) {
    // The request was made but no response was received
    return new MinimaxRequestError('No response received from server');
  } else {
    // Something happened in setting up the request
    return new MinimaxRequestError(`Request configuration error: ${error.message}`);
  }
} 