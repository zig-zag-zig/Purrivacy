import { cleanupExpiredMfaSetups } from '../features/mfa/application/expiredMfaSetupCleanup';
import { cleanupExpiredSessionRecords } from '../features/session/application/expiredSessionCleanup';
import { createLogger } from '../utils/logger';

const logger = createLogger('jobs.maintenance');

let maintenanceInterval: NodeJS.Timeout | null = null;

const runMaintenance = () => {
    cleanupExpiredSessionRecords().catch((error) => logger.error('expired session cleanup failed', { error }));
    cleanupExpiredMfaSetups().catch((error) => logger.error('expired mfa setup cleanup failed', { error }));
};

export const startMaintenanceJobs = (): void => {
    if (maintenanceInterval) {
        return;
    }

    maintenanceInterval = setInterval(runMaintenance, 60 * 60 * 1000);
    logger.info('maintenance jobs started');
};
