import type { Db } from './db.ts';
import type { Storage } from './storage.ts';
import type { Backend } from './backends/types.ts';

/** Dépendances partagées, injectées (facilite les tests). */
export interface Ctx { db: Db; storage: Storage; backend: Backend }

export const nowIso = () => new Date().toISOString();

export class HttpError extends Error {
  status: number; code: string; reason?: string;
  constructor(status: number, code: string, message: string, reason?: string) {
    super(message); this.status = status; this.code = code; this.reason = reason;
  }
}
