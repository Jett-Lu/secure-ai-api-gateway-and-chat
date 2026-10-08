export type ErrorCategory =
  | 'validation_error'
  | 'rate_limit_error'
  | 'timeout_error'
  | 'upstream_error'
  | 'internal_error'
  | 'database_unavailable';

export class AppError extends Error {
  readonly statusCode: number;
  readonly category: ErrorCategory;
  readonly expose: boolean;

  constructor(message: string, statusCode: number, category: ErrorCategory, expose = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.category = category;
    this.expose = expose;
  }
}
