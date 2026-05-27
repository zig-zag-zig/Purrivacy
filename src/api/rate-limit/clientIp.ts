import { Request } from 'express';

const LOCALHOST_ADDRESSES = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1']);

const firstForwardedIp = (req: Request): string | undefined => {
    const forwardedFor = req.headers['x-forwarded-for'];
    if (typeof forwardedFor !== 'string') {
        return undefined;
    }

    return forwardedFor.split(',')[0]?.trim() || undefined;
};

const remoteAddressOrUndefined = (value: unknown): string | undefined => {
    return typeof value === 'string' && !LOCALHOST_ADDRESSES.has(value) ? value : undefined;
};

export const getClientIp = (req: Request): string => {
    return remoteAddressOrUndefined(req.socket.remoteAddress)
        ?? remoteAddressOrUndefined((req as any).connection?.remoteAddress)
        ?? firstForwardedIp(req)
        ?? 'unknown';
};
