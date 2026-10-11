/** Thrown for non-retryable HTTP errors (4xx other than 429) and when retries are exhausted. */
export class PlacesError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly attempts: number;

  constructor(message: string, status: number, body: unknown, attempts = 1) {
    super(message);
    this.name = 'PlacesError';
    this.status = status;
    this.body = body;
    this.attempts = attempts;
  }
}
