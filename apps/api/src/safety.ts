import fs from 'node:fs';
import { config } from './config.ts';

/**
 * Garde-fou de sortie optionnel. Protocole attendu de SAFETY_URL :
 *   POST {SAFETY_URL}/classify   corps = octets JPEG/PNG   →   { "nsfw": 0.0..1.0 }
 * Retourne true si le contenu doit être bloqué. Sans SAFETY_URL : jamais bloqué (limite documentée).
 * Si le service est configuré mais injoignable, on bloque par prudence (fail closed).
 */
export async function isBlockedImage(file: string): Promise<boolean> {
  if (!config.safetyUrl) return false;
  try {
    const res = await fetch(`${config.safetyUrl}/classify`, { method: 'POST', body: new Uint8Array(fs.readFileSync(file)), headers: { 'content-type': 'application/octet-stream' }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return true;
    const j = (await res.json()) as { nsfw?: number };
    return Number(j.nsfw ?? 1) >= config.safetyThreshold;
  } catch {
    return true;
  }
}
