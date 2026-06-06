import { SessionRevocationService } from '../features/session/application/SessionRevocationService';
import { createLogger } from '../utils/logger';

const logger = createLogger('jobs.maintenance');

let maintenanceInterval: NodeJS.Timeout | null = null;

const runMaintenance = () => {
    SessionRevocationService.cleanupExpiredSessions().catch((error) => logger.error('expired session cleanup failed', { error }));
    SessionRevocationService.cleanupExpiredMfaSetups().catch((error) => logger.error('expired mfa setup cleanup failed', { error }));
};

export const startMaintenanceJobs = (): void => {
    if (maintenanceInterval) {
        return;
    }

    maintenanceInterval = setInterval(runMaintenance, 60 * 60 * 1000);
    logger.info('maintenance jobs started');
};
