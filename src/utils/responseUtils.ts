import { Response } from 'express';

/**
 * Standardized response utility for consistent API responses
 */
export class ResponseUtils {
    /**
     * Send a successful JSON response
     */
    static success(res: Response, data: any, statusCode: number = 200): void {
        res.status(statusCode).json(data);
    }

    /**
     * Send an error response
     */
    static error(
        res: Response,
        message: string,
        statusCode: number = 500,
        details?: any
    ): void {
        res.status(statusCode).json({
            ...details,
            error: message,
        });
    }

    /**
     * Send a bad request (400) response
     */
    static badRequest(res: Response, message: string, details?: any): void {
        ResponseUtils.error(res, message, 400, details);
    }

    /**
     * Send a 204 No Content response
     */
    static noContent(res: Response): void {
        res.status(204).send();
    }
}
