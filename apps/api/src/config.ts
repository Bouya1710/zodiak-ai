import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const env = process.env;

const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase()));
const int = (v: string | undefined, d: number) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : d;
};

export type Backend = 'mock' | 'comfyui' | 'runpod' | 'fal';

export interface Config {
  port: number;
  host: string;
  mode: 'personal' | 'multi';
  creditsEnabled: boolean;
  creditsSignup: number;
  registrationOpen: boolean;
  backend: Backend;
  gpuProfile: 'vram12' | 'vram16' | 'vram24';
  dataDir: string;
  dbPath: string;
  mediaDir: string;
  webDir: string;
  workflowsDir: string;
  catalogDir: string;
  workerMode: 'embedded' | 'external';
  workerConcurrency: number;
  cacheEnabled: boolean;
  maxUploadMb: number;
  maxPromptLength: number;
  comfyUrl: string;
  runpodApiKey: string;
  runpodEndpointId: string;
  falKey: string;
  safetyUrl: string;
  safetyThreshold: number;
  mockDelayMs: number;
  adminEmail: string;
  adminPassword: string;
  sessionDays: number;
  secureCookies: boolean;
}

export function loadConfig(e: NodeJS.ProcessEnv = env): Config {
  const dataDir = path.resolve(e.DATA_DIR ?? path.join(root, 'data'));
  const backend = (e.GENERATION_BACKEND ?? 'mock') as Backend;
  if (!['mock', 'comfyui', 'runpod', 'fal'].includes(backend)) throw new Error(`GENERATION_BACKEND invalide: ${backend}`);
  const mode = (e.MODE ?? 'personal') as Config['mode'];
  if (!['personal', 'multi'].includes(mode)) throw new Error(`MODE invalide: ${mode}`);
  const profile = (e.GPU_PROFILE ?? 'vram24') as Config['gpuProfile'];
  if (!['vram12', 'vram16', 'vram24'].includes(profile)) throw new Error(`GPU_PROFILE invalide: ${profile}`);
  return {
    port: int(e.PORT, 8080),
    host: e.HOST ?? '0.0.0.0',
    mode,
    creditsEnabled: mode === 'multi' && bool(e.CREDITS_ENABLED, false),
    creditsSignup: int(e.CREDITS_SIGNUP, 100),
    registrationOpen: bool(e.REGISTRATION_OPEN, true),
    backend,
    gpuProfile: profile,
    dataDir,
    dbPath: path.resolve(e.DB_PATH ?? path.join(dataDir, 'zodiak.db')),
    mediaDir: path.resolve(e.MEDIA_DIR ?? path.join(dataDir, 'media')),
    webDir: path.resolve(e.WEB_DIR ?? path.join(root, 'apps', 'web', 'public')),
    workflowsDir: path.resolve(e.WORKFLOWS_DIR ?? path.join(root, 'workflows')),
    catalogDir: path.resolve(e.CATALOG_DIR ?? path.join(root, 'catalog')),
    workerMode: (e.WORKER_MODE ?? 'embedded') as Config['workerMode'],
    workerConcurrency: Math.max(1, int(e.WORKER_CONCURRENCY, 1)),
    cacheEnabled: bool(e.CACHE_ENABLED, true),
    maxUploadMb: int(e.MAX_UPLOAD_MB, 50),
    maxPromptLength: int(e.MAX_PROMPT_LENGTH, 1500),
    comfyUrl: (e.COMFYUI_URL ?? 'http://127.0.0.1:8188').replace(/\/$/, ''),
    runpodApiKey: e.RUNPOD_API_KEY ?? '',
    runpodEndpointId: e.RUNPOD_ENDPOINT_ID ?? '',
    falKey: e.FAL_KEY ?? '',
    safetyUrl: (e.SAFETY_URL ?? '').replace(/\/$/, ''),
    safetyThreshold: Number(e.SAFETY_THRESHOLD ?? 0.7),
    mockDelayMs: int(e.MOCK_DELAY_MS, 350),
    adminEmail: e.ADMIN_EMAIL ?? '',
    adminPassword: e.ADMIN_PASSWORD ?? '',
    sessionDays: int(e.SESSION_DAYS, 30),
    secureCookies: bool(e.SECURE_COOKIES, false),
  };
}

export const config: Config = loadConfig();
