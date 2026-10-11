import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { DomainError } from './errors';

@Catch(DomainError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(err: DomainError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const status =
      err.code === 'BLOCKED' || err.code === 'KILL_SWITCH' ? HttpStatus.FORBIDDEN
      : err.code === 'QUOTA_EXCEEDED' ? HttpStatus.TOO_MANY_REQUESTS
      : HttpStatus.UNPROCESSABLE_ENTITY;
    res.status(status).json({ error: err.code, message: err.message, details: err.details ?? null });
  }
}
