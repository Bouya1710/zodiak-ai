import fs from 'node:fs';
import path from 'node:path';
import { ffmpeg, probe } from './ffmpeg.ts';

// Outils sans modèle : exécutés par ffmpeg sur le serveur, quel que soit le backend.

export interface ToolResult { file: string; mime: string; kind: 'image' | 'video'; note?: string }
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export async function upscaleImage(input: string, outDir: string, scale: number, signal?: AbortSignal): Promise<ToolResult> {
  const p = await probe(input);
  const file = path.join(outDir, 'upscaled.png');
  await ffmpeg(['-i', input, '-vf', `scale=${(p.width ?? 512) * scale}:${(p.height ?? 512) * scale}:flags=lanczos`, '-frames:v', '1', file], { signal });
  return { file, mime: 'image/png', kind: 'image', note: `agrandissement ×${scale} (lanczos ; Real-ESRGAN si le backend ComfyUI est actif)` };
}

export async function upscaleVideo(input: string, outDir: string, scale: number, signal?: AbortSignal): Promise<ToolResult> {
  const p = await probe(input);
  const file = path.join(outDir, 'upscaled.mp4');
  await ffmpeg(['-i', input, '-vf', `scale=${even((p.width ?? 640) * scale)}:${even((p.height ?? 360) * scale)}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', file], { signal });
  return { file, mime: 'video/mp4', kind: 'video', note: `agrandissement ×${scale} (lanczos)` };
}

export async function interpolate(input: string, outDir: string, factor: number, signal?: AbortSignal): Promise<ToolResult> {
  const rate = (await probe(input)).fps ?? 24;
  const target = Math.min(120, Math.round(rate * factor));
  const file = path.join(outDir, 'interpolated.mp4');
  await ffmpeg(['-i', input, '-vf', `minterpolate=fps=${target}:mi_mode=mci:mc_mode=aobmc:vsbmc=1,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'copy', '-movflags', '+faststart', file], { signal, timeoutMs: 900_000 });
  return { file, mime: 'video/mp4', kind: 'video', note: `${Math.round(rate)} → ${target} i/s (ffmpeg minterpolate ; RIFE non câblé)` };
}

export async function trim(input: string, outDir: string, start: number, end: number, signal?: AbortSignal): Promise<ToolResult> {
  if (!(end > start) || start < 0) throw new Error('intervalle de découpe invalide');
  const file = path.join(outDir, 'trimmed.mp4');
  await ffmpeg(['-ss', String(start), '-to', String(end), '-i', input, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-c:a', 'aac', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { signal });
  return { file, mime: 'video/mp4', kind: 'video' };
}

export async function concat(inputs: string[], outDir: string, signal?: AbortSignal): Promise<ToolResult> {
  if (inputs.length < 2) throw new Error('au moins deux vidéos sont nécessaires');
  const first = await probe(inputs[0]!);
  const w = even(first.width ?? 1280), h = even(first.height ?? 720);
  const args: string[] = [];
  const parts: string[] = [];
  const hasAudio = (await Promise.all(inputs.map((i) => probe(i)))).every((p) => p.hasAudio);
  inputs.forEach((f, i) => {
    args.push('-i', f);
    parts.push(`[${i}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,format=yuv420p[v${i}]`);
    if (hasAudio) parts.push(`[${i}:a]aresample=44100[a${i}]`);
  });
  const joined = inputs.map((_, i) => `[v${i}]${hasAudio ? `[a${i}]` : ''}`).join('');
  parts.push(`${joined}concat=n=${inputs.length}:v=1:a=${hasAudio ? 1 : 0}[v]${hasAudio ? '[a]' : ''}`);
  const file = path.join(outDir, 'concat.mp4');
  await ffmpeg([...args, '-filter_complex', parts.join(';'), '-map', '[v]', ...(hasAudio ? ['-map', '[a]'] : []),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-movflags', '+faststart', file], { signal });
  return { file, mime: 'video/mp4', kind: 'video' };
}

/**
 * Lip-sync. ⚠ Le modèle réel (LatentSync) n'est PAS câblé : cet outil mixe seulement la piste audio
 * sur la vidéo (boucle de la vidéo si l'audio est plus long). Le résultat est signalé comme tel.
 */
export async function lipsyncMock(video: string, audio: string, outDir: string, signal?: AbortSignal): Promise<ToolResult> {
  const file = path.join(outDir, 'lipsync.mp4');
  const a = await probe(audio);
  await ffmpeg(['-stream_loop', '-1', '-i', video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0',
    '-t', String(Math.min(30, a.duration ?? 5)), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', file], { signal });
  return { file, mime: 'video/mp4', kind: 'video', note: 'MOCK : audio ajouté sans synchronisation labiale (LatentSync non câblé)' };
}

export function cleanup(dir: string): void {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}
