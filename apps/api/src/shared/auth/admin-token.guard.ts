import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { ENV, Env } from '../config/config.module';

/**
 * Bearer-token guard for the operator console API. The public endpoints (preview, quote,
 * unsubscribe, takedown, Stripe webhook) deliberately do NOT use it.
 */
@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers?.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : (req.query?.token as string | undefined);
    if (!token) throw new UnauthorizedException('missing admin token');
    const a = Buffer.from(token);
    const b = Buffer.from(this.env.ADMIN_API_TOKEN);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new UnauthorizedException('invalid admin token');
    req.actor = 'operator';
    return true;
  }
}
