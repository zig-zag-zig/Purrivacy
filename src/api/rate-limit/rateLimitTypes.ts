import { Request, Response } from 'express';

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
}

export interface RateLimitEntry {
    count: number;
    resetTime: number;
}
