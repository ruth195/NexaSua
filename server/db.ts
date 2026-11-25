import mongoose from 'mongoose';
import type { IntegrationStatus } from './config/env.js';

interface DbConnectionState {
  status: IntegrationStatus;
  error?: string;
  lastCheckedAt?: Date;
}

const dbState: DbConnectionState = {
  status: 'Not Configured',
};

const globalForDb = globalThis as typeof globalThis & {
  __nexasuaConnectPromise?: Promise<boolean> | null;
};

export function getDbState(): DbConnectionState {
  if (!process.env.MONGODB_URI?.trim()) {
    return { status: 'Not Configured', error: 'MONGODB_URI environment variable is not set.' };
  }
  if (mongoose.connection.readyState === 1) {
    return { status: 'Connected', lastCheckedAt: new Date() };
  }
  return dbState;
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function connectDatabase(): Promise<boolean> {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    dbState.status = 'Not Configured';
    dbState.error = 'MONGODB_URI environment variable is not set.';
    return false;
  }

  if (mongoose.connection.readyState === 1) {
    dbState.status = 'Connected';
    dbState.error = undefined;
    return true;
  }

  if (globalForDb.__nexasuaConnectPromise) {
    return globalForDb.__nexasuaConnectPromise;
  }

  globalForDb.__nexasuaConnectPromise = (async () => {
    try {
      dbState.status = 'Testing';
      dbState.error = undefined;
      mongoose.set('strictQuery', true);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
        maxPoolSize: 10,
      });
      dbState.status = 'Connected';
      dbState.lastCheckedAt = new Date();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to connect to MongoDB Atlas';
      dbState.status = 'Error';
      dbState.error = message;
      dbState.lastCheckedAt = new Date();
      return false;
    } finally {
      globalForDb.__nexasuaConnectPromise = null;
    }
  })();

  return globalForDb.__nexasuaConnectPromise;
}

export async function ensureDatabaseConnection(): Promise<boolean> {
  if (isDbConnected()) return true;
  return connectDatabase();
}

export async function pingDatabase(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
  if (!isDbConnected() || !mongoose.connection.db) {
    return { ok: false, error: getDbState().error || 'Database not connected' };
  }
  const start = Date.now();
  try {
    await mongoose.connection.db.admin().ping();
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Ping failed' };
  }
}
