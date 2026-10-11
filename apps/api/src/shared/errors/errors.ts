export class DomainError extends Error {
  constructor(message: string, readonly code: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainError';
  }
}
export class BlockedError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'BLOCKED', details);
  }
}
export class QuotaExceededError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'QUOTA_EXCEEDED', details);
  }
}
export class KillSwitchError extends DomainError {
  constructor() {
    super('Kill switch engaged: all sends and queues are blocked', 'KILL_SWITCH');
  }
}
