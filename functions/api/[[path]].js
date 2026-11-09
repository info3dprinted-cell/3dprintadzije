// 3D Printadžije – API (Cloudflare Pages Functions)
// Potrebno u Cloudflare projektu:
//   D1 binding  DB      – baza (nalozi, profili, oglasi, statistika)
//   KV binding  SLIKE   – slike (logo, fotografije oglasa)
//   Secret      RESEND_API_KEY – slanje emailova (potvrda naloga, reset lozinke)  [opcionalno]
//   Variable    ADMIN_EMAIL    – email administratora (zadano info.3dprinted@gmail.com)
//   Variable    MAIL_FROM      – pošiljalac (zadano "3D Printadžije <noreply@3dprintadzije.com>")

const DAY = 86400000;
const SESSION_DAYS = 30;
const PBKDF2_ITER = 100000;

/* ======================= pomoćne ======================= */
function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}
const err = (msg, status = 400) => json({ error: msg }, status);
const now = () => Date.now();
const today = () => new Date().toISOString().slice(0, 10);
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const randToken = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
async function sha256(s) { return b64u(await crypto.subtle.digest("SHA-256", enc.encode(s))); }
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
async function hashPassword(pw, saltB64) {
  const salt = saltB64 ? unb64u(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITER }, key, 256);
  return `pbkdf2$${PBKDF2_ITER}$${b64u(salt)}$${b64u(bits)}`;
}
async function verifyPassword(pw, stored) {
  const [, , salt] = String(stored).split("$");
  if (!salt) return false;
  return timingSafeEqual(await hashPassword(pw, salt), stored);
}
const str = (v, max = 500) => String(v ?? "").trim().slice(0, max);
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;
const digits = (p) => String(p || "").replace(/\D/g, "");
function cleanUrl(u) {
  u = str(u, 300);
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; }
}
function cleanImg(u) {
  u = str(u, 300);
  try {
    const x = new URL(u, "https://3dprintadzije.com");
    if (/^\/slike\/[a-f0-9]{32}$/.test(x.pathname) || x.pathname === "/favicon.png" || x.pathname === "/logo.png") return x.pathname;
  } catch {}
  return "";
}
function slugify(s) {
  const map = { č: "c", ć: "c", đ: "dj", š: "s", ž: "z", Č: "c", Ć: "c", Đ: "dj", Š: "s", Ž: "z" };
  return String(s).replace(/[čćđšžČĆĐŠŽ]/g, (c) => map[c]).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "profil";
}
const parseJ = (s, d) => { try { const v = JSON.parse(s); return v ?? d; } catch { return d; } };
function originOk(request) {
  const o = request.headers.get("Origin");
  if (!o) return false;
  try {
    const h = new URL(o).hostname, self = new URL(request.url).hostname;
    return h === self || h === "3dprintadzije.com" || h === "www.3dprintadzije.com" || h.endsWith(".3dprintadzije.pages.dev") || h === "3dprintadzije.pages.dev";
  } catch { return false; }
}
function getCookie(request, name) {
  const c = request.headers.get("Cookie") || "";
  const m = c.match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[1]) : null;
}
function sessionCookie(token, maxAge) {
  return `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
const adminEmail = (env) => (env.ADMIN_EMAIL || "info.3dprinted@gmail.com").toLowerCase();

/* ======================= baza ======================= */
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, verified INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user', created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS tokens (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, kind TEXT NOT NULL, expires INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, user_id INTEGER UNIQUE, naziv TEXT NOT NULL, grad TEXT, telefon TEXT, email TEXT, web TEXT, opis TEXT, logo TEXT, printeri TEXT DEFAULT '[]', plastika TEXT DEFAULT '[]', prodaje TEXT DEFAULT '[]', uloge TEXT DEFAULT '[]', status TEXT NOT NULL DEFAULT 'pending', izdvojen INTEGER NOT NULL DEFAULT 0, azurirano TEXT, created INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ads (id TEXT PRIMARY KEY, user_id INTEGER, profil TEXT, kategorija TEXT NOT NULL, naslov TEXT NOT NULL, cijena TEXT, stanje TEXT, materijal TEXT, boja TEXT, opis TEXT, slike TEXT DEFAULT '[]', grad TEXT, telefon TEXT, prodavac TEXT, status TEXT NOT NULL DEFAULT 'active', izdvojen INTEGER NOT NULL DEFAULT 0, datum TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS stats (kind TEXT NOT NULL, ref TEXT NOT NULL, day TEXT NOT NULL, views INTEGER NOT NULL DEFAULT 0, contacts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (kind, ref, day))`,
  `CREATE TABLE IF NOT EXISTS ratelimit (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS ads_user ON ads(user_id)`,
  `CREATE INDEX IF NOT EXISTS ads_profil ON ads(profil)`,
];
let ready = false;
async function init(env, request) {
  if (ready) return;
  await env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s)));
  // Prvi put: prenesi postojeće profile i oglase iz /data/*.json
  const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM profiles").first();
  if (!c || !c.n) {
    try {
      const base = new URL(request.url).origin;
      const get = async (p) => {
        const r = env.ASSETS ? await env.ASSETS.fetch(new Request(base + p)) : await fetch(base + p);
        return r.ok ? r.json() : [];
      };
      const [ps, as] = await Promise.all([get("/data/printadzije.json"), get("/data/oglasi.json")]);
      const stm = [];
      for (const p of ps) {
        stm.push(env.DB.prepare(`INSERT OR IGNORE INTO profiles (id,naziv,grad,telefon,email,web,opis,logo,printeri,plastika,prodaje,uloge,status,izdvojen,azurirano,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'approved',?,?,?)`)
          .bind(p.id, p.naziv, p.grad || "", p.telefon || "", (p.email || "").toLowerCase(), p.web || "", p.opis || "", p.logo || "", JSON.stringify(p.printeri || []), JSON.stringify(p.plastika || []), JSON.stringify(p.prodaje || []), JSON.stringify((p.printeri || []).length ? ["printer"] : []), p.izdvojen ? 1 : 0, p.azurirano || today(), now()));
      }
      for (const a of as) {
        stm.push(env.DB.prepare(`INSERT OR IGNORE INTO ads (id,profil,kategorija,naslov,cijena,stanje,materijal,boja,opis,slike,grad,telefon,prodavac,status,izdvojen,datum,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?)`)
          .bind(a.id, a.profil || null, a.kategorija, a.naslov, a.cijena || "", a.stanje || "", a.materijal || "", a.boja || "", a.opis || "", JSON.stringify(a.slike || []), a.grad || "", a.telefon || "", a.prodavac || "", a.izdvojen ? 1 : 0, a.datum || today(), now(), now()));
      }
      if (stm.length) await env.DB.batch(stm);
    } catch (e) { /* prenos nije kritičan */ }
  }
  // 9.11.2026: uklonjeni profili preneseni iz starog formulara (bez naloga) – vlasnici prave nove profile s nalogom
  await env.DB.batch([
    env.DB.prepare("DELETE FROM ads WHERE profil IN ('yupa3d','printyourfix') AND user_id IS NULL"),
    env.DB.prepare("DELETE FROM profiles WHERE id IN ('yupa3d','printyourfix') AND user_id IS NULL"),
  ]);
  ready = true;
}

async function rateLimit(env, key, max, windowMs) {
  const t = now();
  const row = await env.DB.prepare("SELECT n, reset FROM ratelimit WHERE k=?").bind(key).first();
  if (!row || row.reset < t) {
    await env.DB.prepare("INSERT OR REPLACE INTO ratelimit (k,n,reset) VALUES (?,1,?)").bind(key, t + windowMs).run();
    return true;
  }
  if (row.n >= max) return false;
  await env.DB.prepare("UPDATE ratelimit SET n=n+1 WHERE k=?").bind(key).run();
  return true;
}
const ipOf = (request) => request.headers.get("CF-Connecting-IP") || "local";

async function currentUser(env, request) {
  const tok = getCookie(request, "sid");
  if (!tok) return null;
  const sid = await sha256(tok);
  const u = await env.DB.prepare("SELECT u.id, u.email, u.verified, u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>?").bind(sid, now()).first();
  if (!u) return null;
  u.admin = !!u.verified && (u.role === "admin" || u.email.toLowerCase() === adminEmail(env));
  return u;
}
async function newSession(env, userId) {
  const tok = randToken();
  await env.DB.prepare("INSERT INTO sessions (id,user_id,expires) VALUES (?,?,?)").bind(await sha256(tok), userId, now() + SESSION_DAYS * DAY).run();
  return sessionCookie(tok, SESSION_DAYS * 86400);
}
async function newToken(env, userId, kind, ttlMs) {
  const tok = randToken();
  await env.DB.prepare("DELETE FROM tokens WHERE user_id=? AND kind=?").bind(userId, kind).run();
  await env.DB.prepare("INSERT INTO tokens (id,user_id,kind,expires) VALUES (?,?,?,?)").bind(await sha256(tok), userId, kind, now() + ttlMs).run();
  return tok;
}
async function useToken(env, tok, kind) {
  if (!tok || typeof tok !== "string" || tok.length > 100) return null;
  const id = await sha256(tok);
  const row = await env.DB.prepare("SELECT user_id, expires FROM tokens WHERE id=? AND kind=?").bind(id, kind).first();
  if (!row || row.expires < now()) return null;
  await env.DB.prepare("DELETE FROM tokens WHERE id=?").bind(id).run();
  return row.user_id;
}

/* ======================= email ======================= */
async function sendMail(env, to, subject, text) {
  if (!env.RESEND_API_KEY) return false;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#141824">${text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/(https:\/\/[^\s]+)/g, '<a href="$1" style="color:#b8650f">$1</a>')
    .replace(/\n/g, "<br>")}<br><br><span style="color:#667085;font-size:13px">3D Printadžije · 3dprintadzije.com</span></div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM || "3D Printadžije <noreply@3dprintadzije.com>", to: [to], subject, text, html }),
    });
    return r.ok;
  } catch { return false; }
}

/* ======================= mapiranje ======================= */
function profileOut(p, priv = false) {
  if (!p) return null;
  const o = {
    id: p.id, naziv: p.naziv, grad: p.grad, telefon: p.telefon, email: p.email, web: p.web, opis: p.opis, logo: p.logo,
    printeri: parseJ(p.printeri, []), plastika: parseJ(p.plastika, []), prodaje: parseJ(p.prodaje, []), uloge: parseJ(p.uloge, []),
    izdvojen: !!p.izdvojen, azurirano: p.azurirano,
  };
  if (priv) o.status = p.status;
  return o;
}
function adOut(a, priv = false) {
  const o = {
    id: a.id, profil: a.profil, kategorija: a.kategorija, naslov: a.naslov, cijena: a.cijena, stanje: a.stanje, materijal: a.materijal, boja: a.boja,
    opis: a.opis, slike: parseJ(a.slike, []), grad: a.grad, telefon: a.telefon, prodavac: a.prodavac, izdvojen: !!a.izdvojen, datum: a.datum,
  };
  if (priv) o.status = a.status;
  return o;
}
const CATS = ["filament", "resin", "oprema", "dijelovi"];
const ROLES = ["printer", "seller"];

function readProfileInput(b) {
  const p = {
    naziv: str(b.naziv, 80), grad: str(b.grad, 60), telefon: str(b.telefon, 30), email: str(b.email, 200).toLowerCase(),
    web: cleanUrl(b.web), opis: str(b.opis, 1000), logo: cleanImg(b.logo),
    printeri: (Array.isArray(b.printeri) ? b.printeri : []).map((x) => str(x, 80)).filter(Boolean).slice(0, 30),
    plastika: (Array.isArray(b.plastika) ? b.plastika : []).filter(Array.isArray).map((s) => [str(s[0], 40), str(s[1], 40), Math.max(0, Math.min(1e6, parseInt(s[2]) || 0))]).filter((s) => s[0]).slice(0, 60),
    prodaje: (Array.isArray(b.prodaje) ? b.prodaje : []).filter((x) => CATS.includes(x)),
    uloge: (Array.isArray(b.uloge) ? b.uloge : []).filter((x) => ROLES.includes(x)),
  };
  const e = [];
  if (p.naziv.length < 2) e.push("naziv");
  if (!p.grad) e.push("grad");
  if (digits(p.telefon).length < 8) e.push("broj telefona");
  if (p.email && !isEmail(p.email)) e.push("email");
  if (b.web && !p.web) e.push("web stranica");
  if (!p.uloge.length) e.push("šta radiš (printaš ili prodaješ)");
  return { p, e };
}
function readAdInput(b) {
  const a = {
    kategorija: CATS.includes(b.kategorija) ? b.kategorija : "", naslov: str(b.naslov, 100), cijena: str(b.cijena, 40),
    stanje: ["Novo", "Polovno"].includes(b.stanje) ? b.stanje : "", materijal: str(b.materijal, 40), boja: str(b.boja, 40),
    opis: str(b.opis, 2000), slike: (Array.isArray(b.slike) ? b.slike : []).map(cleanImg).filter(Boolean).slice(0, 5),
  };
  const e = [];
  if (!a.kategorija) e.push("odjel");
  if (a.naslov.length < 3) e.push("naslov");
  if (!a.cijena) e.push("cijena");
  return { a, e };
}

/* ======================= rute ======================= */
export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  if (!env.DB) return err("Baza još nije povezana sa stranicom.", 503);
  try {
    await init(env, request);
    const path = (params.path || []).join("/");
    const method = request.method;
    if (method !== "GET" && method !== "HEAD" && !originOk(request)) return err("Nedozvoljen izvor zahtjeva.", 403);
    let body = {};
    if (method === "POST" || method === "PUT") {
      const ct = request.headers.get("Content-Type") || "";
      if (ct.includes("application/json")) body = await request.json().catch(() => ({}));
    }
    const user = await currentUser(env, request);
    const R = (m, p) => method === m && path === p;

    /* ---------- javno ---------- */
    if (R("GET", "public")) {
      const ps = await env.DB.prepare("SELECT * FROM profiles WHERE status='approved' ORDER BY izdvojen DESC, azurirano DESC").all();
      const as = await env.DB.prepare("SELECT a.* FROM ads a LEFT JOIN profiles p ON p.id=a.profil WHERE a.status='active' AND (a.profil IS NULL OR p.status='approved') ORDER BY a.izdvojen DESC, a.created DESC LIMIT 500").all();
      return json({ profiles: ps.results.map((p) => profileOut(p)), ads: as.results.map((a) => adOut(a)) }, 200, { "Cache-Control": "public, max-age=30" });
    }
    if (R("POST", "hit")) {
      const kind = body.kind === "p" || body.kind === "o" ? body.kind : null;
      const ref = str(body.ref, 60);
      const col = body.type === "contact" ? "contacts" : "views";
      if (!kind || !/^[a-z0-9-]+$/.test(ref)) return err("Neispravno.");
      if (!(await rateLimit(env, "hit:" + ipOf(request), 300, 3600e3))) return json({ ok: true });
      await env.DB.prepare(`INSERT INTO stats (kind,ref,day,${col}) VALUES (?,?,?,1) ON CONFLICT(kind,ref,day) DO UPDATE SET ${col}=${col}+1`).bind(kind, ref, today()).run();
      return json({ ok: true });
    }

    /* ---------- nalozi ---------- */
    if (R("POST", "auth/register")) {
      if (!(await rateLimit(env, "reg:" + ipOf(request), 10, 3600e3))) return err("Previše pokušaja. Pokušaj kasnije.", 429);
      const email = str(body.email, 200).toLowerCase(), pw = String(body.password || ""), pw2 = String(body.password2 || "");
      if (!isEmail(email)) return err("Upiši ispravan email.");
      if (pw.length < 8) return err("Lozinka mora imati najmanje 8 znakova.");
      if (pw !== pw2) return err("Lozinke se ne podudaraju.");
      if (!body.terms) return err("Potrebno je prihvatiti Uslove korištenja i Politiku privatnosti.");
      const exists = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
      if (exists) return err("Nalog s ovim emailom već postoji. Prijavi se ili resetuj lozinku.", 409);
      const role = email === adminEmail(env) ? "admin" : "user";
      const r = await env.DB.prepare("INSERT INTO users (email,pass,verified,role,created) VALUES (?,?,0,?,?)").bind(email, await hashPassword(pw), role, now()).run();
      const uid = r.meta.last_row_id;
      const tok = await newToken(env, uid, "verify", 7 * DAY);
      const origin = new URL(request.url).origin;
      const sent = await sendMail(env, email, "Potvrdi svoj nalog – 3D Printadžije",
        `Zdravo,\n\nhvala na registraciji na 3D Printadžije. Klikni na link da potvrdiš svoj email:\n${origin}/?potvrdi=${tok}\n\nLink važi 7 dana. Ako se nisi ti registrovao/la, samo ignoriši ovu poruku.`);
      return json({ ok: true, verifySent: sent }, 200, { "Set-Cookie": await newSession(env, uid) });
    }
    if (R("POST", "auth/login")) {
      if (!(await rateLimit(env, "login:" + ipOf(request), 20, 900e3))) return err("Previše pokušaja. Sačekaj 15 minuta.", 429);
      const email = str(body.email, 200).toLowerCase();
      const u = await env.DB.prepare("SELECT id, pass FROM users WHERE email=?").bind(email).first();
      if (!u || !(await verifyPassword(String(body.password || ""), u.pass))) return err("Pogrešan email ili lozinka.", 401);
      return json({ ok: true }, 200, { "Set-Cookie": await newSession(env, u.id) });
    }
    if (R("POST", "auth/logout")) {
      const tok = getCookie(request, "sid");
      if (tok) await env.DB.prepare("DELETE FROM sessions WHERE id=?").bind(await sha256(tok)).run();
      return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
    }
    if (R("POST", "auth/verify")) {
      const uid = await useToken(env, body.token, "verify");
      if (!uid) return err("Link za potvrdu nije ispravan ili je istekao.", 400);
      await env.DB.prepare("UPDATE users SET verified=1 WHERE id=?").bind(uid).run();
      // preuzmi postojeći profil s istim emailom (npr. profil objavljen prije naloga)
      const u = await env.DB.prepare("SELECT email FROM users WHERE id=?").bind(uid).first();
      const has = await env.DB.prepare("SELECT id FROM profiles WHERE user_id=?").bind(uid).first();
      if (!has) {
        const p = await env.DB.prepare("SELECT id FROM profiles WHERE user_id IS NULL AND lower(email)=?").bind(u.email).first();
        if (p) {
          await env.DB.prepare("UPDATE profiles SET user_id=? WHERE id=?").bind(uid, p.id).run();
          await env.DB.prepare("UPDATE ads SET user_id=? WHERE profil=? AND user_id IS NULL").bind(uid, p.id).run();
        }
      }
      return json({ ok: true });
    }
    if (R("POST", "auth/resend")) {
      if (!user) return err("Prijavi se.", 401);
      if (user.verified) return json({ ok: true });
      if (!(await rateLimit(env, "resend:" + user.id, 3, 3600e3))) return err("Već smo poslali. Pogledaj i Spam.", 429);
      const tok = await newToken(env, user.id, "verify", 7 * DAY);
      const sent = await sendMail(env, user.email, "Potvrdi svoj nalog – 3D Printadžije",
        `Zdravo,\n\nklikni na link da potvrdiš svoj email:\n${new URL(request.url).origin}/?potvrdi=${tok}\n\nLink važi 7 dana.`);
      return sent ? json({ ok: true }) : err("Slanje emaila trenutno ne radi. Javi se na info.3dprinted@gmail.com.", 503);
    }
    if (R("POST", "auth/forgot")) {
      if (!(await rateLimit(env, "forgot:" + ipOf(request), 5, 3600e3))) return err("Previše pokušaja. Pokušaj kasnije.", 429);
      if (!env.RESEND_API_KEY) return err("Reset lozinke trenutno ne radi. Javi se na info.3dprinted@gmail.com ili Viber 061 060 784.", 503);
      const email = str(body.email, 200).toLowerCase();
      const u = isEmail(email) ? await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first() : null;
      if (u) {
        const tok = await newToken(env, u.id, "reset", 3600e3);
        await sendMail(env, email, "Nova lozinka – 3D Printadžije",
          `Zdravo,\n\nzatražena je nova lozinka za tvoj nalog. Klikni na link i upiši novu lozinku:\n${new URL(request.url).origin}/?reset=${tok}\n\nLink važi 1 sat. Ako nisi ti tražio/la novu lozinku, ignoriši ovu poruku – stara lozinka i dalje važi.`);
      }
      return json({ ok: true }); // isti odgovor da se ne otkriva da li nalog postoji
    }
    if (R("POST", "auth/reset")) {
      const pw = String(body.password || ""), pw2 = String(body.password2 || "");
      if (pw.length < 8) return err("Lozinka mora imati najmanje 8 znakova.");
      if (pw !== pw2) return err("Lozinke se ne podudaraju.");
      const uid = await useToken(env, body.token, "reset");
      if (!uid) return err("Link za novu lozinku nije ispravan ili je istekao. Zatraži novi.", 400);
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET pass=?, verified=1 WHERE id=?").bind(await hashPassword(pw), uid),
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(uid),
      ]);
      return json({ ok: true }, 200, { "Set-Cookie": await newSession(env, uid) });
    }

    /* ---------- moj nalog ---------- */
    if (path.startsWith("me")) {
      if (!user) return err("Prijavi se.", 401);
      if (R("GET", "me")) {
        const p = await env.DB.prepare("SELECT * FROM profiles WHERE user_id=?").bind(user.id).first();
        const as = await env.DB.prepare("SELECT * FROM ads WHERE user_id=? ORDER BY created DESC").bind(user.id).all();
        return json({ user: { email: user.email, verified: !!user.verified, admin: user.admin, mail: !!env.RESEND_API_KEY }, profile: profileOut(p, true), ads: as.results.map((a) => adOut(a, true)) });
      }
      if (R("PUT", "me/profile")) {
        const { p, e } = readProfileInput(body);
        if (e.length) return err("Provjeri: " + e.join(", ") + ".");
        if (!p.email) p.email = user.email;
        const cur = await env.DB.prepare("SELECT id, status FROM profiles WHERE user_id=?").bind(user.id).first();
        const vals = [p.naziv, p.grad, p.telefon, p.email, p.web, p.opis, p.logo, JSON.stringify(p.printeri), JSON.stringify(p.plastika), JSON.stringify(p.prodaje), JSON.stringify(p.uloge), today()];
        if (cur) {
          await env.DB.prepare("UPDATE profiles SET naziv=?,grad=?,telefon=?,email=?,web=?,opis=?,logo=?,printeri=?,plastika=?,prodaje=?,uloge=?,azurirano=? WHERE id=?").bind(...vals, cur.id).run();
          await env.DB.prepare("UPDATE ads SET grad=?, telefon=?, prodavac=? WHERE profil=?").bind(p.grad, p.telefon, p.naziv, cur.id).run();
          return json({ ok: true, id: cur.id, status: cur.status });
        }
        let id = slugify(p.naziv), n = 1;
        while (await env.DB.prepare("SELECT 1 FROM profiles WHERE id=?").bind(id).first()) id = slugify(p.naziv).slice(0, 36) + "-" + ++n;
        const status = user.admin ? "approved" : "pending";
        await env.DB.prepare("INSERT INTO profiles (naziv,grad,telefon,email,web,opis,logo,printeri,plastika,prodaje,uloge,azurirano,id,user_id,status,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(...vals, id, user.id, status, now()).run();
        if (status === "pending") {
          await sendMail(env, adminEmail(env), `Novi profil čeka odobrenje – ${p.naziv} (${p.grad})`,
            `Novi profil na 3D Printadžije čeka odobrenje.\n\nNaziv: ${p.naziv}\nGrad: ${p.grad}\nTelefon: ${p.telefon}\nEmail: ${p.email}\nWeb: ${p.web || "—"}\nPrinteri: ${p.printeri.join(", ") || "—"}\nProdaje: ${p.prodaje.join(", ") || "—"}\nOpis: ${p.opis || "—"}\n\nOdobri ga ovdje (prijavi se kao admin):\n${new URL(request.url).origin}/#admin`);
        }
        return json({ ok: true, id, status });
      }
      if (R("POST", "me/confirm")) {
        await env.DB.prepare("UPDATE profiles SET azurirano=? WHERE user_id=?").bind(today(), user.id).run();
        return json({ ok: true });
      }
      if (R("POST", "me/password")) {
        const u = await env.DB.prepare("SELECT pass FROM users WHERE id=?").bind(user.id).first();
        if (!(await verifyPassword(String(body.old || ""), u.pass))) return err("Trenutna lozinka nije tačna.", 401);
        const pw = String(body.password || "");
        if (pw.length < 8) return err("Nova lozinka mora imati najmanje 8 znakova.");
        if (pw !== String(body.password2 || "")) return err("Lozinke se ne podudaraju.");
        await env.DB.batch([
          env.DB.prepare("UPDATE users SET pass=? WHERE id=?").bind(await hashPassword(pw), user.id),
          env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
        ]);
        return json({ ok: true }, 200, { "Set-Cookie": await newSession(env, user.id) });
      }
      if (R("POST", "me/delete")) {
        const u = await env.DB.prepare("SELECT pass FROM users WHERE id=?").bind(user.id).first();
        if (!(await verifyPassword(String(body.password || ""), u.pass))) return err("Lozinka nije tačna.", 401);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM ads WHERE user_id=?").bind(user.id),
          env.DB.prepare("DELETE FROM profiles WHERE user_id=?").bind(user.id),
          env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(user.id),
          env.DB.prepare("DELETE FROM tokens WHERE user_id=?").bind(user.id),
          env.DB.prepare("DELETE FROM users WHERE id=?").bind(user.id),
        ]);
        return json({ ok: true }, 200, { "Set-Cookie": sessionCookie("", 0) });
      }
      if (R("POST", "me/ads")) {
        const prof = await env.DB.prepare("SELECT id, naziv, grad, telefon FROM profiles WHERE user_id=?").bind(user.id).first();
        if (!prof) return err("Prvo popuni svoj profil.", 400);
        const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM ads WHERE user_id=?").bind(user.id).first();
        if (cnt.n >= 100) return err("Dostignut je maksimalan broj oglasa (100).", 400);
        const { a, e } = readAdInput(body);
        if (e.length) return err("Popuni: " + e.join(", ") + ".");
        const id = randToken(6).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) + now().toString(36).slice(-4);
        await env.DB.prepare("INSERT INTO ads (id,user_id,profil,kategorija,naslov,cijena,stanje,materijal,boja,opis,slike,grad,telefon,prodavac,status,datum,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?)")
          .bind(id, user.id, prof.id, a.kategorija, a.naslov, a.cijena, a.stanje, a.materijal, a.boja, a.opis, JSON.stringify(a.slike), prof.grad, prof.telefon, prof.naziv, today(), now(), now()).run();
        return json({ ok: true, id });
      }
      const m = path.match(/^me\/ads\/([a-z0-9-]+)$/);
      if (m) {
        const ad = await env.DB.prepare("SELECT id, status FROM ads WHERE id=? AND user_id=?").bind(m[1], user.id).first();
        if (!ad) return err("Oglas nije pronađen.", 404);
        if (method === "DELETE") { await env.DB.prepare("DELETE FROM ads WHERE id=?").bind(ad.id).run(); return json({ ok: true }); }
        if (method === "PUT") {
          if (body.status && !body.naslov) {
            if (!["active", "sold"].includes(body.status) || ad.status === "hidden") return err("Neispravan status.");
            await env.DB.prepare("UPDATE ads SET status=?, updated=? WHERE id=?").bind(body.status, now(), ad.id).run();
            return json({ ok: true });
          }
          const { a, e } = readAdInput(body);
          if (e.length) return err("Popuni: " + e.join(", ") + ".");
          await env.DB.prepare("UPDATE ads SET kategorija=?,naslov=?,cijena=?,stanje=?,materijal=?,boja=?,opis=?,slike=?,updated=? WHERE id=?")
            .bind(a.kategorija, a.naslov, a.cijena, a.stanje, a.materijal, a.boja, a.opis, JSON.stringify(a.slike), now(), ad.id).run();
          return json({ ok: true });
        }
      }
      if (R("GET", "me/stats")) {
        const prof = await env.DB.prepare("SELECT id FROM profiles WHERE user_id=?").bind(user.id).first();
        const ads = await env.DB.prepare("SELECT id, naslov, status FROM ads WHERE user_id=?").bind(user.id).all();
        const since = new Date(now() - 29 * DAY).toISOString().slice(0, 10);
        const refs = [];
        if (prof) refs.push(["p", prof.id]);
        ads.results.forEach((a) => refs.push(["o", a.id]));
        const rows = [];
        for (let i = 0; i < refs.length; i += 40) {
          const chunk = refs.slice(i, i + 40);
          const q = `SELECT kind, ref, day, views, contacts FROM stats WHERE day>=? AND (${chunk.map(() => "(kind=? AND ref=?)").join(" OR ")})`;
          const r = await env.DB.prepare(q).bind(since, ...chunk.flat()).all();
          rows.push(...r.results);
        }
        const totals = await env.DB.prepare(`SELECT kind, ref, SUM(views) AS v, SUM(contacts) AS c FROM stats WHERE ${refs.length ? refs.map(() => "(kind=? AND ref=?)").join(" OR ") : "0"} GROUP BY kind, ref`).bind(...refs.flat()).all();
        return json({ since, rows, totals: totals.results, ads: ads.results, profile: prof ? prof.id : null });
      }
    }

    /* ---------- slike ---------- */
    if (R("POST", "slika")) {
      if (!user) return err("Prijavi se da bi dodao/la slike.", 401);
      if (!env.SLIKE) return err("Pohrana slika još nije podešena.", 503);
      if (!(await rateLimit(env, "up:" + user.id, 100, 3600e3))) return err("Previše slika u kratkom vremenu.", 429);
      const form = await request.formData().catch(() => null);
      const file = form && form.get("file");
      if (!file || typeof file === "string") return err("Nema slike.");
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return err("Dozvoljene su JPG, PNG i WEBP slike.", 415);
      if (file.size > 2 * 1024 * 1024) return err("Slika je prevelika (max 2 MB).", 413);
      const id = crypto.randomUUID().replace(/-/g, "");
      await env.SLIKE.put(id, await file.arrayBuffer(), { metadata: { type: file.type, t: now(), u: user.id } });
      return json({ url: `/slike/${id}` });
    }

    /* ---------- admin ---------- */
    if (path.startsWith("admin")) {
      if (!user || !user.admin) return err("Samo za administratora.", 403);
      if (R("GET", "admin")) {
        const ps = await env.DB.prepare("SELECT p.*, u.email AS login_email, u.verified FROM profiles p LEFT JOIN users u ON u.id=p.user_id ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END, p.created DESC").all();
        const as = await env.DB.prepare("SELECT * FROM ads ORDER BY created DESC LIMIT 200").all();
        const uc = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
        const since = new Date(now() - 6 * DAY).toISOString().slice(0, 10);
        const st = await env.DB.prepare("SELECT day, SUM(views) AS v, SUM(contacts) AS c FROM stats WHERE day>=? GROUP BY day ORDER BY day").bind(since).all();
        return json({
          profiles: ps.results.map((p) => ({ ...profileOut(p, true), login: p.login_email || null, verified: !!p.verified })),
          ads: as.results.map((a) => adOut(a, true)), users: uc.n, stats: st.results,
        });
      }
      if (R("POST", "admin/profile")) {
        const id = str(body.id, 60);
        if (body.status && !["approved", "hidden", "pending"].includes(body.status)) return err("Neispravan status.");
        if (body.status) await env.DB.prepare("UPDATE profiles SET status=? WHERE id=?").bind(body.status, id).run();
        if (typeof body.izdvojen === "boolean") await env.DB.prepare("UPDATE profiles SET izdvojen=? WHERE id=?").bind(body.izdvojen ? 1 : 0, id).run();
        return json({ ok: true });
      }
      if (R("POST", "admin/delete-profile")) {
        const id = str(body.id, 60);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM ads WHERE profil=?").bind(id),
          env.DB.prepare("DELETE FROM profiles WHERE id=?").bind(id),
        ]);
        return json({ ok: true });
      }
      if (R("POST", "admin/delete-ad")) {
        await env.DB.prepare("DELETE FROM ads WHERE id=?").bind(str(body.id, 60)).run();
        return json({ ok: true });
      }
      if (R("POST", "admin/ad")) {
        const id = str(body.id, 60);
        if (body.status && !["active", "hidden", "sold"].includes(body.status)) return err("Neispravan status.");
        if (body.status) await env.DB.prepare("UPDATE ads SET status=? WHERE id=?").bind(body.status, id).run();
        if (typeof body.izdvojen === "boolean") await env.DB.prepare("UPDATE ads SET izdvojen=? WHERE id=?").bind(body.izdvojen ? 1 : 0, id).run();
        return json({ ok: true });
      }
    }

    return err("Nije pronađeno.", 404);
  } catch (e) {
    return err("Greška na serveru. Pokušaj ponovo.", 500);
  }
}
