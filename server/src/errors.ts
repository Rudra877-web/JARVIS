export class AppError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message); this.name = 'AppError';
  }
  static badRequest(m: string, d?: unknown) { return new AppError(400, 'BAD_REQUEST', m, d); }
  static unauthorized(m = 'Authentication required') { return new AppError(401, 'UNAUTHORIZED', m); }
  static forbidden(m = 'Forbidden') { return new AppError(403, 'FORBIDDEN', m); }
  static notFound(m = 'Not found') { return new AppError(404, 'NOT_FOUND', m); }
  static conflict(m: string) { return new AppError(409, 'CONFLICT', m); }
  static tooMany(m: string) { return new AppError(429, 'TOO_MANY_REQUESTS', m); }
}
