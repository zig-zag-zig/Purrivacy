import * as admin from 'firebase-admin';
import * as fs from "fs";
import { env } from '../../config/env';
import { createLogger } from '../../utils/logger';

const logger = createLogger('infrastructure.firebase');

const loadServiceAccount = (): admin.ServiceAccount => {
    if (env.firebaseServiceAccountJson) {
        return JSON.parse(env.firebaseServiceAccountJson) as admin.ServiceAccount;
    }

    const filePath = env.firebaseCredentialsPath;
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`Firebase service account file not found at ${filePath}`);
    }

    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as admin.ServiceAccount;
};

try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(loadServiceAccount()),
            ...(env.firebaseDatabaseUrl ? { databaseURL: env.firebaseDatabaseUrl } : {}),
        });
    }

    logger.info("firebase admin initialized");
} catch (error) {
    logger.error("firebase admin initialization failed", { error });
    throw error;
}

export const db = admin.firestore();
export const auth = admin.auth();
export const rtdb = admin.database();

db.settings({ ignoreUndefinedProperties: true });
