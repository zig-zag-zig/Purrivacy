import { Request } from 'express';
import { getClientIp } from '../../../../src/api/rate-limit/clientIp';

describe('getClientIp', () => {
    it('returns socket.remoteAddress for non-localhost remote', () => {
        const req = { socket: { remoteAddress: '203.0.113.10' }, headers: {} } as unknown as Request;
        expect(getClientIp(req)).toBe('203.0.113.10');
    });

    it('prefers socket.remoteAddress over X-Forwarded-For', () => {
        const req = {
            socket: { remoteAddress: '203.0.113.10' },
            headers: { 'x-forwarded-for': '198.51.100.7' },
        } as unknown as Request;
        expect(getClientIp(req)).toBe('203.0.113.10');
    });

    it('falls back to X-Forwarded-For when remoteAddress is localhost', () => {
        const req = {
            socket: { remoteAddress: '127.0.0.1' },
            headers: { 'x-forwarded-for': '198.51.100.7, 198.51.100.8' },
        } as unknown as Request;
        expect(getClientIp(req)).toBe('198.51.100.7');
    });

    it('falls back to X-Forwarded-For when remoteAddress is ::1', () => {
        const req = {
            socket: { remoteAddress: '::1' },
            headers: { 'x-forwarded-for': '198.51.100.7' },
        } as unknown as Request;
        expect(getClientIp(req)).toBe('198.51.100.7');
    });

    it('falls back to connection.remoteAddress', () => {
        const req = {
            socket: { remoteAddress: '127.0.0.1' },
            connection: { remoteAddress: '10.0.0.1' },
            headers: {},
        } as unknown as Request;
        expect(getClientIp(req)).toBe('10.0.0.1');
    });

    it('returns "unknown" when no IP source is available', () => {
        const req = { socket: { remoteAddress: '127.0.0.1' }, headers: {} } as unknown as Request;
        expect(getClientIp(req)).toBe('unknown');
    });

    it('returns "unknown" when X-Forwarded-For is not a string', () => {
        const req = {
            socket: { remoteAddress: '127.0.0.1' },
            headers: { 'x-forwarded-for': undefined },
        } as unknown as Request;
        expect(getClientIp(req)).toBe('unknown');
    });

    it('trims leading/trailing whitespace from X-Forwarded-For', () => {
        const req = {
            socket: { remoteAddress: '127.0.0.1' },
            headers: { 'x-forwarded-for': '  198.51.100.7  , 198.51.100.8' },
        } as unknown as Request;
        expect(getClientIp(req)).toBe('198.51.100.7');
    });

    it('filters localhost-mapped IPv4 address', () => {
        const req = {
            socket: { remoteAddress: '::ffff:127.0.0.1' },
            connection: { remoteAddress: '10.0.0.2' },
            headers: {},
        } as unknown as Request;
        expect(getClientIp(req)).toBe('10.0.0.2');
    });
});
