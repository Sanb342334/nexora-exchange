import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Внутренняя ошибка сервера';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const body = res as Record<string, unknown>;
        message = (body.message as string | string[]) ?? exception.message;
        error = (body.error as string) ?? exception.name;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      status = HttpStatus.BAD_REQUEST;
      error = 'DatabaseError';
      switch (exception.code) {
        case 'P2002':
          message = 'Запись с такими уникальными данными уже существует';
          status = HttpStatus.CONFLICT;
          break;
        case 'P2025':
          message = 'Запись не найдена';
          status = HttpStatus.NOT_FOUND;
          break;
        default:
          message = `Ошибка базы данных (${exception.code})`;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= 500) {
      this.logger.error(
        `${request?.method} ${request?.url} -> ${status}`,
        (exception as Error)?.stack,
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request?.url,
      timestamp: new Date().toISOString(),
    });
  }
}
