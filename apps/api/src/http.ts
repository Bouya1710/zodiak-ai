import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { HttpError } from './ctx.ts';

export interface Req {
  method: string; url: URL; params: Record<string, string>; query: URLSearchParams;
  raw: http.IncomingMessage; res: http.ServerResponse;
  cookies: Record<string, string>; ip: string;
  user: any | null;
  json(): Promise<Record<string, any>>;
  multipart(maxBytes: number): Promise<{ fields: Record<string, string>; file?: { name: string; data: Buffer } }>;
}
export type Handler = (r: Req) => unknown | Promise<unknown>;
interface Route { method: string; re: RegExp; keys: string[]; handler: Handler }

export class Router {
  routes: Route[] = [];
  add(method: string, pattern: string, handler: Handler) {
    const keys: string[] = [];
    const re = new RegExp('^' + pattern.replace(/:([a-z]+)/gi, (_m, k: string) => { keys.push(k); return '([^/]+)'; }) + '/?$');
    this.routes.push({ method, re, keys, handler });
  }
  get = (p: string, h: Handler) => this.add('GET', p, h);
  post = (p: string, h: Handler) => this.add('POST', p, h);
  patch = (p: string, h: Handler) => this.add('PATCH', p, h);
  delete = (p: string, h: Handler) => this.add('DELETE', p, h);
  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | 'method' | null {
    let pathMatched = false;
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (r.method !== method) continue;
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]!); });
      return { handler: r.handler, params };
    }
    return pathMatched ? 'method' : null;
  }
}

export function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string | string[]> = {}) {
  const data = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': data.length, ...headers });
  res.end(data);
}

export function parseCookies(h: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (h ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function readBody(req: Readable, max: number): Promise<Buffer> {
  const chunks: Buffer[] = []; let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > max) throw new HttpError(413, 'invalid', 'Corps de requête trop volumineux');
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks);
}

export function makeReq(raw: http.IncomingMessage, res: http.ServerResponse): Req {
  const url = new URL(raw.url ?? '/', 'http://localhost');
  return {
    method: raw.method ?? 'GET', url, params: {}, query: url.searchParams, raw, res,
    cookies: parseCookies(raw.headers.cookie), ip: raw.socket.remoteAddress ?? '', user: null,
    async json() {
      const buf = await readBody(raw, 1_000_000);
      if (!buf.length) return {};
      try { const v = JSON.parse(buf.toString('utf8')); return v && typeof v === 'object' ? v : {}; } catch { throw new HttpError(400, 'invalid', 'JSON invalide'); }
    },
    async multipart(maxBytes: number) {
      const ct = raw.headers['content-type'] ?? '';
      const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(ct);
      if (!/multipart\/form-data/i.test(ct) || !m) throw new HttpError(400, 'invalid', 'multipart/form-data attendu');
      return parseMultipart(await readBody(raw, maxBytes + 100_000), (m[1] ?? m[2])!);
    },
  };
}

export function parseMultipart(body: Buffer, boundary: string) {
  const fields: Record<string, string> = {};
  let file: { name: string; data: Buffer } | undefined;
  const delim = Buffer.from(`--${boundary}`);
  let pos = body.indexOf(delim);
  while (pos !== -1) {
    const next = body.indexOf(delim, pos + delim.length);
    if (next === -1) break;
    let part = body.subarray(pos + delim.length, next);
    if (part.subarray(0, 2).toString() === '--') break;
    if (part.subarray(0, 2).toString() === '\r\n') part = part.subarray(2);
    if (part.subarray(part.length - 2).toString() === '\r\n') part = part.subarray(0, part.length - 2);
    const split = part.indexOf('\r\n\r\n');
    if (split !== -1) {
      const head = part.subarray(0, split).toString('utf8');
      const data = part.subarray(split + 4);
      const name = /name="([^"]*)"/i.exec(head)?.[1];
      const filename = /filename="([^"]*)"/i.exec(head)?.[1];
      if (name) {
        if (filename !== undefined) { if (name === 'file') file = { name: filename, data }; }
        else fields[name] = data.toString('utf8');
      }
    }
    pos = next;
  }
  return { fields, file };
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

/** Envoie un fichier avec support de Range (lecture vidéo / seek). */
export function sendFile(r: Req, abs: string, mime: string, extra: Record<string, string> = {}) {
  let st: fs.Stats;
  try { st = fs.statSync(abs); } catch { throw new HttpError(404, 'not_found', 'Fichier introuvable'); }
  const range = /^bytes=(\d*)-(\d*)$/.exec(r.raw.headers.range ?? '');
  let start = 0, end = st.size - 1, status = 200;
  const headers: Record<string, string | number> = { 'content-type': mime, 'accept-ranges': 'bytes', ...extra };
  if (range && (range[1] || range[2])) {
    if (range[1]) { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
    else { start = Math.max(0, st.size - Number(range[2])); }
    if (start > end || start >= st.size) { r.res.writeHead(416, { 'content-range': `bytes */${st.size}` }); r.res.end(); return; }
    status = 206; headers['content-range'] = `bytes ${start}-${end}/${st.size}`;
  }
  headers['content-length'] = end - start + 1;
  r.res.writeHead(status, headers);
  if (r.method === 'HEAD') return r.res.end();
  fs.createReadStream(abs, { start, end }).pipe(r.res);
}

export function serveStatic(r: Req, webDir: string): boolean {
  let rel = decodeURIComponent(r.url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let abs = path.resolve(webDir, '.' + rel);
  if (abs !== webDir && !abs.startsWith(webDir + path.sep)) return false;
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    if (path.extname(rel)) return false;
    abs = path.join(webDir, 'index.html'); // routage côté client
    if (!fs.existsSync(abs)) return false;
  }
  sendFile(r, abs, MIME[path.extname(abs)] ?? 'application/octet-stream', { 'cache-control': abs.endsWith('index.html') ? 'no-cache' : 'public, max-age=300' });
  return true;
}

/** Limiteur de débit en mémoire (fenêtre glissante simple). */
export class RateLimiter {
  hits = new Map<string, number[]>();
  check(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (arr.length >= max) { this.hits.set(key, arr); return false; }
    arr.push(now); this.hits.set(key, arr);
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (!v.some((t) => now - t < windowMs)) this.hits.delete(k);
    return true;
  }
}

export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'same-origin',
  'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
};
