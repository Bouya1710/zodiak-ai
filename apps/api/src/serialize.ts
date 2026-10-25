import type { Row } from './db.ts';

export const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'video/mp4': 'mp4', 'video/webm': 'webm', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' };

export function serializeAsset(r: Row) {
  return {
    id: r.id, kind: r.kind, mime: r.mime,
    url: `/api/assets/${r.id}/file`, thumbUrl: r.thumb_key ? `/api/assets/${r.id}/thumb` : null,
    width: r.width ?? null, height: r.height ?? null, duration: r.duration ?? null,
    title: r.title ?? null, prompt: r.prompt ?? null, jobId: r.job_id ?? null,
    favorite: !!r.favorite, origin: r.origin, createdAt: r.created_at,
  };
}


/** Détection du type réel par signature (on ne se fie pas au Content-Type du client). */
export function sniff(b: Buffer): { mime: string; kind: 'image' | 'video' | 'audio' | 'container' } | null {
  if (b.length < 12) return null;
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', kind: 'image' };
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', kind: 'image' };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', kind: 'image' };
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WAVE') return { mime: 'audio/wav', kind: 'audio' };
  if (b.toString('ascii', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1]! & 0xe0) === 0xe0)) return { mime: 'audio/mpeg', kind: 'audio' };
  if (b.toString('ascii', 0, 4) === 'OggS') return { mime: 'audio/ogg', kind: 'audio' };
  if (b.toString('ascii', 4, 8) === 'ftyp') return { mime: 'video/mp4', kind: 'container' };
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { mime: 'video/webm', kind: 'video' };
  return null;
}
