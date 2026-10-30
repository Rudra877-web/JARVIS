export class AppError extends Error {
    status;
    code;
    details;
    constructor(status, code, message, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
        this.name = 'AppError';
    }
    static badRequest(m, d) { return new AppError(400, 'BAD_REQUEST', m, d); }
    static unauthorized(m = 'Authentication required') { return new AppError(401, 'UNAUTHORIZED', m); }
    static forbidden(m = 'Forbidden') { return new AppError(403, 'FORBIDDEN', m); }
    static notFound(m = 'Not found') { return new AppError(404, 'NOT_FOUND', m); }
    static conflict(m) { return new AppError(409, 'CONFLICT', m); }
    static tooMany(m) { return new AppError(429, 'TOO_MANY_REQUESTS', m); }
}
