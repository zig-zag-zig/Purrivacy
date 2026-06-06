export interface CreateSessionOptions {
    userHasMfa?: boolean;
    mfaTrusted?: boolean;
    label?: string;
    platform?: string;
    deviceId?: string;
}

export interface GeneratedRefreshToken {
    tokenId: string;
    rawToken: string;
    tokenHash: string;
}

