// Lokalni server: statika + Pages Functions (API, slike) nad simuliranim D1/KV
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { makeD1, makeKV, makeAssets } from "./harness.mjs";
const ROOT = "..";
const api = await import(ROOT + "/functions/api/[[path]].js");
const slike = await import(ROOT + "/functions/slike/[id].js");
const env = { DB: makeD1(), SLIKE: makeKV(), ASSETS: makeAssets(ROOT), ADMIN_EMAIL: "info.3dprinted@gmail.com", RESEND_API_KEY: "test" };
export const MAILS = [];
globalThis.__realFetch = globalThis.fetch;
globalThis.fetch = async (url, opts) => { if (String(url).includes("resend")) { MAILS.push(JSON.parse(opts.body)); fs.writeFileSync("/tmp/mails.json", JSON.stringify(MAILS)); return new Response("{}"); } return __realFetch(url, opts); };
const types = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain", ".svg": "image/svg+xml" };
http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:8790");
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const mk = () => new Request("https://3dprintadzije.com" + url.pathname + url.search, { method: req.method, headers: { ...req.headers, origin: req.headers.origin ? "https://3dprintadzije.com" : undefined }, body: ["GET","HEAD"].includes(req.method) ? undefined : body });
  let r;
  try {
    if (url.pathname.startsWith("/api/")) r = await api.onRequest({ request: mk(), env, params: { path: url.pathname.slice(5).split("/") } });
    else if (url.pathname.startsWith("/slike/")) r = await slike.onRequestGet({ request: mk(), env, params: { id: url.pathname.slice(7) } });
    else { let f = url.pathname === "/" ? "/index.html" : url.pathname; const fp = path.join(ROOT, f); if (fs.existsSync(fp) && fs.statSync(fp).isFile()) r = new Response(fs.readFileSync(fp), { headers: { "Content-Type": types[path.extname(fp)] || "application/octet-stream" } }); else r = new Response("404", { status: 404 }); }
  } catch (e) { r = new Response(String(e.stack), { status: 500 }); }
  const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
  if (h["set-cookie"]) h["set-cookie"] = h["set-cookie"].replace("; Secure", "");
  res.writeHead(r.status, h); res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8790, () => console.log("ready"));
