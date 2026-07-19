import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  DatabaseConfigException,
  RedisConnectionException,
  RedisClientNotInitializedException,
  UnknownAppRoleException,
} from './system.exceptions';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();

    // Nếu ứng dụng đang chạy ở chế độ non-HTTP (như microservice/worker),
    // ArgumentsHost sẽ không chứa các HTTP objects. Ta cần kiểm tra:
    if (host.getType() !== 'http') {
      this.logger.error(`Non-HTTP exception caught: ${String(exception)}`);
      return;
    }

    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    // 1. Xử lý các lỗi HTTP chuẩn của NestJS
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    }
    // 2. Xử lý các lỗi cấu hình/hạ tầng hệ thống của dự án
    else if (
      exception instanceof DatabaseConfigException ||
      exception instanceof RedisConnectionException ||
      exception instanceof RedisClientNotInitializedException ||
      exception instanceof UnknownAppRoleException
    ) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = {
        statusCode: status,
        message: 'Internal server error: System configuration issue',
        error: exception.name,
      };

      this.logger.error(
        `System Exception [${exception.name}]: ${exception.message}`,
        exception.stack,
      );
    }
    // 3. Xử lý các Exception dạng Error chung hoặc lỗi không xác định
    else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = {
        statusCode: status,
        message: exception.message || 'Internal server error',
      };

      this.logger.error(
        `Unhandled Exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      this.logger.error(`Unknown error type caught: ${String(exception)}`);
    }

    // Định dạng response trả về nhất quán
    const errorResponse =
      typeof message === 'string' ? { statusCode: status, message } : message;

    response.status(status).json({
      ...errorResponse,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
