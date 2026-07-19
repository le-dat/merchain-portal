/**
 * Lỗi cấu hình Database
 */
export class DatabaseConfigException extends Error {
  constructor() {
    super('DATABASE_URL environment variable is missing');
    this.name = 'DatabaseConfigException';
  }
}

/**
 * Lỗi kết nối Redis
 */
export class RedisConnectionException extends Error {
  constructor(url: string, cause?: Error) {
    super(
      `Failed to connect to Redis at ${url}${cause ? `: ${cause.message}` : ''}`,
    );
    this.name = 'RedisConnectionException';
  }
}

/**
 * Lỗi truy cập Redis client chưa được khởi tạo
 */
export class RedisClientNotInitializedException extends Error {
  constructor(index: number) {
    super(`Redis client at index ${index} is not initialized`);
    this.name = 'RedisClientNotInitializedException';
  }
}

/**
 * Lỗi vai trò ứng dụng không hợp lệ
 */
export class UnknownAppRoleException extends Error {
  constructor(role: string) {
    super(`Unknown APP_ROLE: "${role}". Application shutting down.`);
    this.name = 'UnknownAppRoleException';
  }
}
