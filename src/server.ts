import { captureError, flushErrorMonitoring } from './infrastructure/monitoring/sentry';
import app from './app';
import { env } from './config/env';
import { startMaintenanceJobs } from './jobs/maintenanceJobs';
import { createLogger } from './utils/logger';

const logger = createLogger('server');

app.listen(env.port, () => {
    logger.info('server started', { port: env.port, nodeEnv: env.nodeEnv });
});

startMaintenanceJobs();

process.on('unhandledRejection', (reason) => {
    logger.error('unhandled promise rejection', { reason });
    captureError(reason, { source: 'unhandledRejection' });
});

process.on('uncaughtException', (error) => {
    logger.error('uncaught exception', { message: error.message, stack: error.stack });
    captureError(error, { source: 'uncaughtException' });
    void flushErrorMonitoring().finally(() => {
        process.exit(1);
    });
});
