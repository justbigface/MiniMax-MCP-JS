import { MiniMaxAPI } from '../utils/api.js';
import { Config } from '../types/index.js';

/**
 * Base service interface
 */
export interface ServiceInterface {
  getServiceName(): string;
  initialize(config: Config): Promise<void>;
}

/**
 * Base service abstract class, all services inherit from this class
 */
export abstract class BaseService implements ServiceInterface {
  protected api: MiniMaxAPI;
  protected config: Config;
  protected initialized: boolean = false;
  protected serviceName: string;

  /**
   * Create service instance
   * @param api API instance
   * @param serviceName Service name
   */
  constructor(api: MiniMaxAPI, serviceName: string) {
    this.api = api;
    this.serviceName = serviceName;
    this.config = {} as Config; // Initialize as empty object, will be set in initialize
  }

  /**
   * Get service name
   * @returns Service name
   */
  public getServiceName(): string {
    return this.serviceName;
  }

  /**
   * Initialize service
   * @param config Configuration
   */
  public async initialize(config: Config): Promise<void> {
    this.config = config;
    this.initialized = true;
  }

  /**
   * Check if service is initialized
   * @throws Error when not initialized
   */
  protected checkInitialized(): void {
    if (!this.initialized) {
      throw new Error(`服务 ${this.serviceName} 尚未初始化`);
    }
  }

  /**
   * Update API instance
   * @param api New API instance
   */
  public updateApi(api: MiniMaxAPI): void {
    this.api = api;
  }
}

/**
 * Service manager, responsible for managing and accessing all services
 */
export class ServiceManager {
  private static instance: ServiceManager;
  private services: Map<string, ServiceInterface> = new Map();
  private api: MiniMaxAPI;
  private config: Config;

  /**
   * Create service manager instance
   * @param api API instance
   * @param config Configuration
   */
  private constructor(api: MiniMaxAPI, config: Config) {
    this.api = api;
    this.config = config;
  }

  /**
   * Get service manager instance (singleton pattern)
   * @param api API instance
   * @param config Configuration
   * @returns Service manager instance
   */
  public static getInstance(api: MiniMaxAPI, config: Config): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager(api, config);
    }
    return ServiceManager.instance;
  }

  /**
   * Register service
   * @param service Service instance
   */
  public registerService(service: ServiceInterface): void {
    service.initialize(this.config);
    this.services.set(service.getServiceName(), service);
  }

  /**
   * Get service
   * @param serviceName Service name
   * @returns Service instance
   * @throws Error when service not found
   */
  public getService<T extends ServiceInterface>(serviceName: string): T {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`找不到服务: ${serviceName}`);
    }
    return service as T;
  }

  /**
   * Update configuration and API instance
   * @param config New configuration
   */
  public updateConfig(config: Config): void {
    this.config = config;
    this.api = new MiniMaxAPI(config);
    
    // Update all services
    for (const service of this.services.values()) {
      if (service instanceof BaseService) {
        service.updateApi(this.api);
      }
      service.initialize(config);
    }
  }

  /**
   * Get all service names
   * @returns Array of service names
   */
  public getServiceNames(): string[] {
    return [...this.services.keys()];
  }
} 