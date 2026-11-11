import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { Role, Session, StaffUser, User } from '@prisma/client';

export type StaffWithRole = StaffUser & { role: Role };

export interface AppRequest extends Request {
  id: string;
  user?: User;
  customerSession?: Session;
  staff?: StaffWithRole;
  staffSession?: Session;
  rawBody?: Buffer;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().user;
});

export const CurrentStaff = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<AppRequest>().staff;
});

export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return clientIp(ctx.switchToHttp().getRequest<AppRequest>());
});

/** The real visitor IP. Express resolves X-Forwarded-For only from trusted proxies (Nginx / Next on loopback). */
export function clientIp(req: Request) {
  return (req.ip ?? req.socket.remoteAddress ?? 'unknown').replace(/^::ffff:/, '');
}
