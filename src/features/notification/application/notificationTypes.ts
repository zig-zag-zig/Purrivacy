export type NotificationKind = 'visible' | 'data';

export type SendNotificationOptions = {
    title?: string;
    body?: string;
    eventName?: string;
    payload?: Record<string, any>;
    excludeDeviceId?: string;
};

