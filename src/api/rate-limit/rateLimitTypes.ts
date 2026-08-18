import { Request, Response } from 'express';
import { AppError } from '../../utils/errors';

type RateLimitKeyGenerator = (req: Request) => string;
type RateLimitSkipResponse = (req: Request, res: Response) => boolean;

export interface RateLimitConfig {
    name?: string;
    windowMs: number;
    maxRequests: number;
    keyGenerator?: RateLimitKeyGenerator;
    skipSuccessfulRequests?: boolean;
    skipResponse?: RateLimitSkipResponse;
    message?: string;
    /**
     * Marks a limiter as security-critical (brute-force/recovery/MFA/session
     * boundaries). When the shared rate limit store is unavailable and
     * `RATE_LIMIT_FAIL_CLOSED` is enabled, critical limiters reject requests
     * instead of silently falling back to a process-local store.
     */
    critical?: boolean;
}

/**
 * Raised when a security-critical rate limit store is unavailable and the
 * deployment runs fail-closed. A 503 tells clients to back off and retry
 * rather than treating the request as rate-limited (429).
 */
export class RateLimitUnavailableError extends AppError {
    constructor(message: string = 'Rate limiting service temporarily unavailable', details?: Record<string, unknown>) {
        super(message, 503, details);
    }
}
