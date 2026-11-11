import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

export interface FieldError {
  path: string;
  message: string;
}

/**
 * Every API error carries a stable machine code the web apps translate into
 * friendly copy (e.g. STOCK_INSUFFICIENT, COUPON_INVALID, RATE_LIMITED).
 */
export class AppError extends HttpException {
  constructor(
    status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly retryAfter?: number,
  ) {
    super(message, status);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.BAD_REQUEST, code, message, details);
export const unauthorized = (message = 'Please sign in to continue.') =>
  new AppError(HttpStatus.UNAUTHORIZED, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You do not have permission to do that.') =>
  new AppError(HttpStatus.FORBIDDEN, 'FORBIDDEN', message);
export const notFound = (what = 'That item') =>
  new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', `${what} could not be found.`);
export const conflict = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.CONFLICT, code, message, details);
export const unprocessable = (code: string, message: string, details?: unknown) =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, code, message, details);
export const tooManyRequests = (retryAfter: number) =>
  new AppError(
    HttpStatus.TOO_MANY_REQUESTS,
    'RATE_LIMITED',
    `Too many tries. Please try again in ${humanWait(retryAfter)}.`,
    undefined,
    retryAfter,
  );

function humanWait(seconds: number) {
  if (seconds < 60) return `${seconds} seconds`;
  const minutes = Math.ceil(seconds / 60);
  return minutes === 1 ? '1 minute' : `${minutes} minutes`;
}

/** Shapes every error as RFC 9457 problem details. */
@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    let status = 500;
    let code = 'INTERNAL_ERROR';
    let detail = 'Something went wrong on our side. Please try again.';
    let errors: unknown;

    if (exception instanceof AppError) {
      status = exception.getStatus();
      code = exception.code;
      detail = exception.message;
      errors = exception.details;
      if (exception.retryAfter) res.setHeader('Retry-After', String(exception.retryAfter));
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        code = 'ALREADY_EXISTS';
        const target = (exception.meta?.target as string[] | undefined)?.join(', ');
        detail = target ? `A record with this ${target} already exists.` : 'This record already exists.';
      } else if (exception.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        detail = 'That item could not be found.';
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = status === 404 ? 'NOT_FOUND' : status === 413 ? 'PAYLOAD_TOO_LARGE' : `HTTP_${status}`;
      const body = exception.getResponse();
      detail = typeof body === 'string' ? body : ((body as { message?: string }).message ?? exception.message);
      if (Array.isArray(detail)) detail = detail.join(', ');
    } else {
      const err = exception as Error;
      this.logger.error(`${req.method} ${req.originalUrl}: ${err?.message}`, err?.stack);
    }

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://errors.sssfurniture.co.in/${code.toLowerCase()}`,
        title: HttpStatus[status] ?? 'Error',
        status,
        code,
        detail,
        ...(errors ? { errors } : {}),
        requestId: req.id,
      });
  }
}
