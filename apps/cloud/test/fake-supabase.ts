import http from 'node:http';
import crypto from 'node:crypto';
import type { AddressInfo } from 'node:net';

// Faux Supabase minimal (PostgREST + Auth + Storage) pour tester la couche cloud sans réseau.
// Il reproduit uniquement les appels réellement utilisés ; il ne remplace pas un test sur le vrai service.
type Row = Record<string, any>;
export const SECRET = 'test-secret';

export async function startFakeSupabase() {
  const tables: Record<string, Row[]> = { profiles: [], jobs: [], assets: [], characters: [], credit_ledger: [], audit_log: [] };
  const users = new Map<string, { id: string; email: string; password: string }>();
  const files = new Map<string, Buffer>();
  let ledgerId = 1;
  const rid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();

  const jwtFor = (id: string) => `fake.${Buffer.from(JSON.stringify({ sub: id })).toString('base64url')}.sig`;
  const subOf = (h: string | undefined): string | null => {
    const t = (h ?? '').replace(/^Bearer /, '');
    if (!t.startsWith('fake.')) return null;
    try { return JSON.parse(Buffer.from(t.split('.')[1]!, 'base64url').toString()).sub; } catch { return null; }
  };

  const read = async (req: http.IncomingMessage) => { const c: Buffer[] = []; for await (const x of req) c.push(x as Buffer); return Buffer.concat(c); };
  const json = (res: http.ServerResponse, status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

  const matches = (row: Row, key: string, expr: string): boolean => {
    if (key === 'or') {
      return expr.slice(1, -1).split(',').some((part) => { const [col, op, ...v] = part.split('.'); return matches(row, col!, `${op}.${v.join('.')}`); });
    }
    const [op, ...rest] = expr.split('.'); const val = rest.join('.');
    const cell = row[key];
    if (op === 'eq') return String(cell) === val;
    if (op === 'in') return val.slice(1, -1).split(',').includes(String(cell));
    if (op === 'lt') return String(cell) < val;
    if (op === 'ilike') { const re = new RegExp('^' + val.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i'); return re.test(String(cell ?? '')); }
    return true;
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url!, 'http://x');
    const p = url.pathname;
    try {
      // ---- Auth
      if (p === '/auth/v1/token') {
        const b = JSON.parse((await read(req)).toString());
        if (url.searchParams.get('grant_type') === 'password') {
          const u = [...users.values()].find((x) => x.email === b.email && x.password === b.password);
          if (!u) return json(res, 400, { error: 'invalid_grant' });
          return json(res, 200, { access_token: jwtFor(u.id), refresh_token: 'r-' + u.id });
        }
        const id = String(b.refresh_token).replace('r-', '');
        return users.has(id) ? json(res, 200, { access_token: jwtFor(id), refresh_token: 'r-' + id }) : json(res, 400, { error: 'bad refresh' });
      }
      // ---- RPC
      if (p.startsWith('/rest/v1/rpc/')) {
        const name = p.split('/').pop()!; const a = JSON.parse((await read(req)).toString() || '{}');
        if (a.p_secret !== SECRET) return json(res, 401, { message: 'forbidden' });
        if (name === 'app_register') {
          if ([...users.values()].some((u) => u.email === a.p_email)) return json(res, 400, { message: 'email_exists' });
          const id = rid(); users.set(id, { id, email: a.p_email, password: a.p_password });
          tables.profiles!.push({ id, email: a.p_email, role: a.p_role, credits: a.p_credits, created_at: now() });
          if (a.p_credits > 0) tables.credit_ledger!.push({ id: ledgerId++, user_id: id, delta: a.p_credits, reason: 'signup', job_id: null, created_at: now() });
          return json(res, 200, id);
        }
        if (name === 'app_credits') {
          const pr = tables.profiles!.find((r) => r.id === a.p_user);
          if (!pr || pr.credits + a.p_delta < 0) return json(res, 400, { message: 'insufficient_credits' });
          pr.credits += a.p_delta;
          tables.credit_ledger!.push({ id: ledgerId++, user_id: a.p_user, delta: a.p_delta, reason: a.p_reason, job_id: a.p_job, created_at: now() });
          return json(res, 200, pr.credits);
        }
        if (name === 'app_write') {
          const t = tables[a.p_table]; if (!t) return json(res, 400, { message: 'table_not_allowed' });
          if (a.p_op === 'insert') {
            const row = { id: rid(), created_at: now(), ...(a.p_table === 'jobs' ? { progress: 0, cost: 0, cache_hit: false, cancel_requested: false, result_asset_ids: '[]', params: '{}' } : {}), ...(a.p_table === 'assets' ? { favorite: false } : {}), ...a.p_row };
            t.push(row); return json(res, 200, row);
          }
          const row = t.find((r) => r.id === a.p_id);
          if (a.p_op === 'get') return json(res, 200, row ?? null);
          if (!row) return json(res, 200, null);
          if (a.p_op === 'update') { Object.assign(row, a.p_row); return json(res, 200, row); }
          if (a.p_op === 'delete') { t.splice(t.indexOf(row), 1); return json(res, 200, row); }
        }
        if (name === 'app_spent_since') return json(res, 200, tables.jobs!.filter((r) => r.created_at >= a.p_since).reduce((n, r) => n + (r.cost ?? 0), 0));
        return json(res, 404, { message: 'unknown rpc' });
      }
      // ---- PostgREST (RLS : lignes du propriétaire)
      if (p.startsWith('/rest/v1/')) {
        const table = p.split('/')[3]!;
        if (!table) return json(res, 200, {});
        const sub = subOf(req.headers.authorization);
        if (!sub) return json(res, 401, { message: 'JWT invalid' });
        let rows = (tables[table] ?? []).filter((r) => (table === 'profiles' ? r.id === sub : r.user_id === sub));
        for (const [k, v] of url.searchParams) if (!['select', 'order', 'limit'].includes(k)) rows = rows.filter((r) => matches(r, k, v));
        const order = url.searchParams.get('order');
        if (order) rows = [...rows].sort((x, y) => { for (const o of order.split(',')) { const [c, d] = o.split('.'); const cmp = String(x[c!]) < String(y[c!]) ? -1 : String(x[c!]) > String(y[c!]) ? 1 : 0; if (cmp) return d === 'desc' ? -cmp : cmp; } return 0; });
        const limit = Number(url.searchParams.get('limit') ?? 1000);
        return json(res, 200, rows.slice(0, limit));
      }
      // ---- Storage
      if (p.startsWith('/storage/v1/object/')) {
        const rest = p.replace('/storage/v1/object/', '');
        if (req.method === 'POST' && rest.startsWith('sign/')) {
          if (!subOf(req.headers.authorization)) return json(res, 401, { message: 'unauthorized' });
          return json(res, 200, { signedURL: `/object/${rest}?token=t` });
        }
        if (req.method === 'GET' && rest.startsWith('sign/')) { const f = files.get(decodeURIComponent(rest.replace('sign/media/', ''))); return f ? (res.writeHead(200), res.end(f)) : json(res, 404, {}); }
        if (req.method === 'DELETE') { for (const k of JSON.parse((await read(req)).toString()).prefixes) files.delete(k); return json(res, 200, []); }
        const key = decodeURIComponent(rest.replace('media/', ''));
        const sub = subOf(req.headers.authorization);
        if (!sub || !key.startsWith(sub + '/')) return json(res, 403, { message: 'row-level security' });
        if (req.method === 'POST') { files.set(key, await read(req)); return json(res, 200, { Key: key }); }
        if (req.method === 'GET') { const f = files.get(key); return f ? (res.writeHead(200), res.end(f)) : json(res, 404, {}); }
      }
      json(res, 404, { message: 'not found ' + p });
    } catch (e) { json(res, 500, { message: String(e) }); }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, tables, files, close: () => server.close() };
}
