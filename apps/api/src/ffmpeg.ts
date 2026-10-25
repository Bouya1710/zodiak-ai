import { spawn } from 'node:child_process';

export interface RunResult { stdout: string; stderr: string; code: number }

export function run(cmd: string, args: string[], opts: { signal?: AbortSignal; timeoutMs?: number; input?: Buffer } = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], signal: opts.signal });
    const out: Buffer[] = [], err: Buffer[] = [];
    const timer = opts.timeoutMs ? setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs) : undefined;
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => err.push(d));
    child.on('error', (e) => { if (timer) clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      const r = { stdout: Buffer.concat(out).toString(), stderr: Buffer.concat(err).toString(), code: code ?? -1 };
      if (r.code !== 0) reject(new Error(`${cmd} a échoué (code ${r.code}): ${r.stderr.slice(-400)}`));
      else resolve(r);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(opts.input);
  });
}

/** Binaire ffmpeg : FFMPEG_PATH (ex. ffmpeg-static sur Vercel) sinon `ffmpeg` du PATH. */
export const ffmpegBin = () => process.env.FFMPEG_PATH || 'ffmpeg';

export const ffmpeg = (args: string[], opts?: { signal?: AbortSignal; timeoutMs?: number }) =>
  run(ffmpegBin(), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { timeoutMs: 600_000, ...opts });

export interface Probe { width: number | null; height: number | null; duration: number | null; fps: number | null; hasAudio: boolean; hasVideo: boolean }

/** Analyse via `ffmpeg -i` (sortie stderr) : repli quand ffprobe est absent (ex. ffmpeg-static). */
async function probeWithFfmpeg(file: string): Promise<Probe> {
  const stderr = await new Promise<string>((resolve, reject) => {
    const c = spawn(ffmpegBin(), ['-hide_banner', '-i', file], { stdio: ['ignore', 'ignore', 'pipe'] });
    const e: Buffer[] = [];
    c.stderr.on('data', (d) => e.push(d));
    c.on('error', reject);
    c.on('close', () => resolve(Buffer.concat(e).toString()));
  });
  const dur = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const vid = /Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(stderr);
  const fps = /(\d+(?:\.\d+)?) fps/.exec(stderr);
  return {
    width: vid ? Number(vid[1]) : null, height: vid ? Number(vid[2]) : null,
    duration: dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : null,
    fps: fps ? Number(fps[1]) : null, hasAudio: /Stream #[^\n]*Audio:/.test(stderr), hasVideo: !!vid,
  };
}

export async function probe(file: string): Promise<Probe> {
  let out: string;
  try {
    out = (await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { timeoutMs: 30_000 })).stdout;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return probeWithFfmpeg(file);
    throw e;
  }
  const j = JSON.parse(out);
  const v = (j.streams ?? []).find((s: any) => s.codec_type === 'video');
  const a = (j.streams ?? []).find((s: any) => s.codec_type === 'audio');
  const dur = Number(j.format?.duration ?? v?.duration);
  const [n, d] = String(v?.r_frame_rate ?? '').split('/').map(Number);
  return { width: v?.width ?? null, height: v?.height ?? null, duration: Number.isFinite(dur) ? dur : null, fps: d ? n! / d : (n || null), hasAudio: !!a, hasVideo: !!v };
}

/** Vignette JPEG de 384 px de large (image ou première image d'une vidéo). */
export async function makeThumb(src: string, dest: string): Promise<void> {
  await ffmpeg(['-i', src, '-frames:v', '1', '-vf', 'scale=384:-2', '-q:v', '4', dest], { timeoutMs: 60_000 });
}
