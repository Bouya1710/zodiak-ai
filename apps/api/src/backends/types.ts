import type { JobKind } from '../catalog.ts';

export interface GenRequest {
  kind: 't2i' | 'i2v' | 't2v' | 'upscale';
  prompt: string;
  negative: string;
  width: number;
  height: number;
  seed: number;
  steps: number;
  duration: number;
  fps: number;
  draft: boolean;
  motion: string;
  scale: number;
  inputPath: string | null;
  loraName: string | null;
  workDir: string;
  signal: AbortSignal;
  progress: (pct: number, message: string) => void;
}

export interface GenResult { file: string; mime: string; kind: 'image' | 'video'; note?: string }

export interface Backend {
  id: string;
  /** Types de jobs de génération pris en charge ; les outils ffmpeg sont gérés ailleurs. */
  supports(kind: JobKind): boolean;
  generate(req: GenRequest): Promise<GenResult>;
  cancel?(): Promise<void>;
  health(): Promise<boolean>;
}

export class CanceledError extends Error {
  constructor() { super('annulé'); this.name = 'CanceledError'; }
}
