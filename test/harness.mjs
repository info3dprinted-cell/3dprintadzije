// Mini simulacija Cloudflare Pages Functions okruženja (D1 preko node:sqlite, KV u memoriji)
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
export function makeD1() {
  const db = new DatabaseSync(":memory:");
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => { const s = db.prepare(sql); const r = s.get(...args); return r ? { ...r } : null; },
    all: async () => ({ results: db.prepare(sql).all(...args).map((r) => ({ ...r })) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
    _exec: () => { const s = db.prepare(sql); return /^\s*(select)/i.test(sql) ? s.all(...args) : s.run(...args); },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { db.exec("BEGIN"); try { const out = list.map((s) => s._exec()); db.exec("COMMIT"); return out; } catch (e) { db.exec("ROLLBACK"); throw e; } }, _db: db };
}
export function makeKV() { const m = new Map(); return { put: async (k, v, o) => m.set(k, { v, meta: o?.metadata }), getWithMetadata: async (k) => { const e = m.get(k); return e ? { value: e.v, metadata: e.meta } : { value: null, metadata: null }; }, _m: m }; }
export function makeAssets(root) { return { fetch: async (req) => { const p = new URL(req.url).pathname; try { return new Response(fs.readFileSync(root + p)); } catch { return new Response("", { status: 404 }); } } }; }
