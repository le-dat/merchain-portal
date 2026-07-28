import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';
import Redlock from 'redlock';
import {
  RedisConnectionException,
  RedisClientNotInitializedException,
} from '../exceptions/system.exceptions';

@Injectable()
export class RedlockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedlockService.name);
  private clients: RedisClientType[] = [];
  private redlock: Redlock;

  async onModuleInit() {
    const urlsStr = process.env.REDIS_URLS || 'redis://localhost:6379';
    const urls = urlsStr.split(',').map((url) => url.trim());

    // Khởi tạo các Redis client kết nối độc lập
    for (const url of urls) {
      try {
        const client = createClient({ url }) as RedisClientType;
        client.on('error', (err) =>
          this.logger.error(
            `Redis connection error on ${url}: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        await client.connect();
        this.clients.push(client);
      } catch (err) {
        const connectionErr = new RedisConnectionException(url, err as Error);
        this.logger.error(
          `Redis connection failed at ${url}: ${connectionErr.message}`,
          connectionErr.stack,
        );
        throw connectionErr;
      }
    }

    // Khởi tạo Redlock với các client đã kết nối
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    this.redlock = new Redlock(this.clients, {
      driftFactor: 0.01,
      retryCount: 10,
      retryDelay: 200,
      retryJitter: 200,
      automaticExtensionThreshold: 500,
    });

    this.logger.log(
      `Redlock initialized successfully with ${this.clients.length} client(s)`,
    );
  }

  async onModuleDestroy() {
    // Ngắt kết nối các client khi destroy module
    if (this.redlock) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        await (this.redlock as any).quit();
      } catch (err) {
        this.logger.error(
          'Error during redlock quit',
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    for (const client of this.clients) {
      try {
        if (client.isOpen) {
          await client.quit();
        }
      } catch (err) {
        this.logger.error(
          'Error during redis client quit',
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
    this.logger.log('Redis and Redlock clients disconnected');
  }

  /**
   * Acquire a lock for the given resources
   * @param resources List of resource keys to lock
   * @param ttl Time-To-Live in milliseconds
   */
  acquire(resources: string[], ttl: number): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return (this.redlock as any).acquire(resources, ttl);
  }

  /**
   * Release a previously acquired lock
   * @param lock The lock object returned by acquire()
   */
  async release(lock: any): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    await lock.release();
  }

  /**
   * Safely execute an operation within a Redlock distributed lock.
   * Handles acquire and guaranteed release in a try-finally block.
   */
  async executeWithLock<T>(
    resources: string[],
    ttl: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const lock = await this.acquire(resources, ttl);
    try {
      return await fn();
    } finally {
      if (lock) {
        try {
          await this.release(lock);
          this.logger.debug(
            `Released Redlock for resources: ${resources.join(', ')}`,
          );
        } catch (err) {
          this.logger.error(
            `Error releasing Redlock for ${resources.join(', ')}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  }

  /**
   * Lấy Redis Client chính để thực hiện các lệnh cache thông thường (mặc định lấy client đầu tiên)
   */
  getClient(index = 0): RedisClientType {
    const client = this.clients[index];
    if (!client) {
      throw new RedisClientNotInitializedException(index);
    }
    return client;
  }
}
