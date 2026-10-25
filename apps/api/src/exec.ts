import { catalog } from './catalog.ts';
import type { Backend, GenRequest } from './backends/types.ts';
import { CanceledError } from './backends/types.ts';
import * as tools from './tools.ts';

export interface ExecEnv {
  backend: Backend;
  /** Chemin local (lisible) d'un média, identifié par son id. */
  inputPath: (assetId: string) => string;
  /** Genre d'un média ('image' | 'video' | 'audio'). */
  assetKind: (assetId: string) => string;
  character?: { description?: string | null; lora_name?: string | null } | null;
  workDir: string;
  signal: AbortSignal;
  progress: (pct: number, message: string) => void;
}

export interface Output { file: string; mime: string; kind: 'image' | 'video'; note?: string }

/** Prépare la requête de génération (backend IA) d'un job de type t2i / i2v / t2v. */
export function buildGenRequest(job: Record<string, any>, env: ExecEnv): GenRequest {
  const p = JSON.parse(job.params);
  const preset = catalog.presets.find((x) => x.id === job.preset_id);
  const prompt = [job.prompt, env.character?.description, preset?.promptFragment].filter(Boolean).join(', ');
  const negative = [job.negative_prompt, preset?.negativeFragment].filter(Boolean).join(', ');
  return {
    kind: job.kind, prompt, negative, width: p.width, height: p.height, seed: p.seed, steps: p.steps,
    duration: p.duration ?? 5, fps: p.fps ?? 24, draft: !!p.draft, motion: preset?.motion ?? 'zoom_in', scale: 1,
    inputPath: job.input_asset_id ? env.inputPath(job.input_asset_id) : null,
    loraName: env.character?.lora_name ?? null, workDir: env.workDir, signal: env.signal, progress: env.progress,
  };
}

/** Exécute un job (génération ou outil) et renvoie le fichier produit. Indépendant de la base de données. */
export async function executeJob(job: Record<string, any>, env: ExecEnv): Promise<Output> {
  const p = JSON.parse(job.params);
  const { progress, workDir, signal } = env;
  switch (job.kind) {
    case 't2i': case 'i2v': case 't2v':
      return env.backend.generate(buildGenRequest(job, env));
    case 'upscale': {
      const src = env.inputPath(job.input_asset_id);
      const isImage = env.assetKind(job.input_asset_id) === 'image';
      progress(20, 'Agrandissement');
      if (isImage && env.backend.id === 'comfyui') {
        try {
          return await env.backend.generate({ kind: 'upscale', prompt: '', negative: '', width: 0, height: 0, seed: 0, steps: 0, duration: 0, fps: 0, draft: false, motion: '', scale: p.scale, inputPath: src, loraName: null, workDir, signal, progress });
        } catch (e) { if (e instanceof CanceledError) throw e; /* repli ffmpeg */ }
      }
      return isImage ? tools.upscaleImage(src, workDir, p.scale, signal) : tools.upscaleVideo(src, workDir, p.scale, signal);
    }
    case 'interpolate': progress(20, 'Interpolation'); return tools.interpolate(env.inputPath(job.input_asset_id), workDir, p.factor, signal);
    case 'trim': progress(20, 'Découpe'); return tools.trim(env.inputPath(job.input_asset_id), workDir, p.start, p.end, signal);
    case 'concat': progress(20, 'Assemblage'); return tools.concat((p.assetIds as string[]).map((id) => env.inputPath(id)), workDir, signal);
    case 'lipsync': progress(20, 'Synchronisation'); return tools.lipsyncMock(env.inputPath(job.input_asset_id), env.inputPath(job.audio_asset_id), workDir, signal);
    default: throw new Error(`type de job inconnu : ${job.kind}`);
  }
}
