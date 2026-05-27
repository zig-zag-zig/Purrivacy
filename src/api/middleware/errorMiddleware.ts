import { Request, Response, NextFunction } from 'express';
import { ResponseUtils } from '../../utils/responseUtils';
import { AppError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

const logger = createLogger('api.error');

/**
 * Global error handling middleware
 */
export function errorMiddleware(err: any, req: Request, res: Response, next: NextFunction): void {
    if (res.headersSent) {
        next(err);
        return;
    }

    const timestamp = new Date().toISOString();
    const requestId = res.locals.requestId;
    err.details = err.details ? { ...err.details, timestamp, requestId } : { timestamp, requestId };
    res.locals.errorDetails = err.details;

    const logMeta = {
        requestId,
        message: err.message,
        name: err.name,
        statusCode: err.statusCode,
        path: req.path,
        method: req.method,
        userId: (req as any).userId,
        details: err.details,
        stack: err.stack,
    };

    if (err instanceof AppError && err.statusCode < 500) {
        logger.warn('request error', logMeta);
    } else {
        logger.error('unhandled request error', logMeta);
    }

    if (err instanceof SyntaxError && 'body' in err) {
        ResponseUtils.error(res, 'Invalid JSON request body', 400, { timestamp, requestId });
        return;
    }

    if (err.type === 'entity.too.large') {
        ResponseUtils.error(res, 'Request body is too large', err.status || 413, { timestamp, requestId });
        return;
    }

    // Handle AppError and its subclasses
    if (err instanceof AppError) {
        ResponseUtils.error(res, err.message, err.statusCode, err.details);
        return;
    }

    const statusCode = err.statusCode || err.status || 500;
    const message = statusCode >= 500
        ? 'Internal server error'
        : err.message || 'Request failed';

    ResponseUtils.error(res, message, statusCode, { timestamp, requestId });
}
