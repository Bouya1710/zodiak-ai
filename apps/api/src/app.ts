import http from 'node:http';
import { config } from './config.ts';
import { HttpError, type Ctx } from './ctx.ts';
import { getUser } from './auth.ts';
import { makeReq, send, serveStatic, SECURITY_HEADERS } from './http.ts';
import { buildRouter } from './routes.ts';

export function createServer(ctx: Ctx): http.Server {
  const router = buildRouter(ctx);
  return http.createServer(async (raw, res) => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    const r = makeReq(raw, res);
    try {
      const pathname = r.url.pathname;
      if (pathname.startsWith('/api/')) {
        const m = router.match(r.method === 'HEAD' ? 'GET' : r.method, pathname);
        if (!m) throw new HttpError(404, 'not_found', 'Route inconnue');
        if (m === 'method') throw new HttpError(405, 'invalid', 'Méthode non autorisée');
        r.params = m.params;
        // Protection CSRF simple : les écritures doivent venir de la même origine.
        if (!['GET', 'HEAD'].includes(r.method) && raw.headers.origin) {
          const o = new URL(raw.headers.origin);
          if (o.host !== raw.headers.host) throw new HttpError(403, 'forbidden', 'Origine refusée');
        }
        r.user = getUser(ctx.db, r.cookies['zodiak_session']);
        const out = await m.handler(r);
        if (out !== undefined && !res.headersSent) send(res, 200, out);
        return;
      }
      if (!['GET', 'HEAD'].includes(r.method)) throw new HttpError(405, 'invalid', 'Méthode non autorisée');
      if (!serveStatic(r, config.webDir)) throw new HttpError(404, 'not_found', 'Introuvable');
    } catch (e) {
      if (res.headersSent) { res.end(); return; }
      if (e instanceof HttpError) {
        send(res, e.status, { error: e.message, code: e.code, ...(e.reason ? { reason: e.reason } : {}) });
      } else {
        console.error('[erreur]', e);
        send(res, 500, { error: 'Erreur interne', code: 'internal' });
      }
    }
  });
}
