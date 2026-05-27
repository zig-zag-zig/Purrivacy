import { SendNotificationOptions, NotificationKind } from './notificationTypes';

export const getNotificationKind = (options: SendNotificationOptions): NotificationKind => {
    const hasTitleOrBody = !!options.title?.trim() || !!options.body?.trim();
    const hasEventName = !!options.eventName?.trim();
    const hasPayload = options.payload !== undefined;

    if (hasTitleOrBody) {
        if (hasEventName || hasPayload) {
            throw new Error('Visible notifications cannot contain data fields. Remove eventName/payload.');
        }
        return 'visible';
    }

    if (!hasEventName) {
        throw new Error('Data notifications require eventName (non-empty string).');
    }

    if (
        options.payload !== undefined &&
        (options.payload === null || typeof options.payload !== 'object' || Array.isArray(options.payload))
    ) {
        throw new Error('payload must be an object when provided');
    }

    return 'data';
};

