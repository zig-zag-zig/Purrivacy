jest.mock('../../../src/features/session/application/expiredSessionCleanup', () => ({
    cleanupExpiredSessionRecords: jest.fn().mockResolvedValue(0),
}));

jest.mock('../../../src/features/mfa/application/expiredMfaSetupCleanup', () => ({
    cleanupExpiredMfaSetups: jest.fn().mockResolvedValue(0),
}));

const loadJobs = (): typeof import('../../../src/jobs/maintenanceJobs') => (
    require('../../../src/jobs/maintenanceJobs')
);

describe('maintenanceJobs', () => {
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('starts the maintenance interval', () => {
        const { startMaintenanceJobs } = loadJobs();
        startMaintenanceJobs();
        // verify the interval was set (1 hour in ms)
        expect(jest.getTimerCount()).toBe(1);
    });

    it('calling startMaintenanceJobs twice does not crash', () => {
        const { startMaintenanceJobs } = loadJobs();
        startMaintenanceJobs();
        expect(() => startMaintenanceJobs()).not.toThrow();
    });

    it('stopMaintenanceJobs clears the interval', () => {
        const { startMaintenanceJobs, stopMaintenanceJobs } = loadJobs();
        startMaintenanceJobs();
        stopMaintenanceJobs();
        expect(jest.getTimerCount()).toBe(0);
    });
});
