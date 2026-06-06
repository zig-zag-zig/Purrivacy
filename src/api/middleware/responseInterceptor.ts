import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env';

/**
 * Response interceptor middleware
 * Adds common headers and handles response formatting
 */
export function responseInterceptor(req: Request, res: Response, next: NextFunction): void {
    // Store the original json method
    const originalJson = res.json;

    // Override the json method to intercept responses
    res.json = function (data: any): Response {
        // Add new recovery codes to response if they exist
        if (res.locals.newRecoveryCodes) {
            if (typeof data === 'object' && data !== null) {
                data.newRecoveryCodes = res.locals.newRecoveryCodes;
            }
        }

        // Call the original json method
        return originalJson.call(this, data);
    };

    const deviceIdHeader = req.headers['x-device-id'];
    const deviceId = Array.isArray(deviceIdHeader) ? deviceIdHeader[0] : deviceIdHeader;
    (req as any).deviceId = typeof deviceId === 'string' ? deviceId : undefined;

    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Native clients do not send Origin; web deployments must set ALLOWED_ORIGINS explicitly.
    const allowedOrigins = env.allowedOrigins;
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes('*')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Session-ID, X-Device-ID');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    next();
}
