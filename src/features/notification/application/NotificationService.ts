import { sendPushNotification } from './sendPushNotification';

/**
 * Public facade for notification use cases.
 */
export class NotificationService {
    static async sendDataOnlyNotification(
        userId: string,
        eventName: string,
        payload?: Record<string, any>,
        options?: { excludeDeviceId?: string },
    ): Promise<void> {
        await sendPushNotification(userId, {
            eventName,
            payload,
            excludeDeviceId: options?.excludeDeviceId,
        });
    }
}

