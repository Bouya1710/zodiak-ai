// Point d'entrée unique de l'API sur Vercel (toutes les routes /api/* y sont redirigées, voir vercel.json).
import fs from 'node:fs';
import path from 'node:path';

process.env.CATALOG_DIR ??= path.join(process.cwd(), 'catalog');
process.env.WORKFLOWS_DIR ??= path.join(process.cwd(), 'workflows');
process.env.GENERATION_BACKEND ??= 'mock';
process.env.MOCK_MAX_SIDE ??= '768';
process.env.MOCK_DELAY_MS ??= '120';

// ffmpeg embarqué (paquet ffmpeg-static), copié dans /tmp pour être exécutable.
try {
  const { default: bin } = await import('ffmpeg-static');
  if (bin) {
    const dest = '/tmp/zodiak-ffmpeg';
    if (!fs.existsSync(dest)) { fs.copyFileSync(bin, dest); fs.chmodSync(dest, 0o755); }
    process.env.FFMPEG_PATH = dest;
  }
} catch (e) {
  console.error('ffmpeg-static indisponible :', e?.message);
}

const { handle } = await import('../cloud-dist/apps/cloud/src/app.js');

export default function handler(req, res) {
  return handle(req, res);
}
