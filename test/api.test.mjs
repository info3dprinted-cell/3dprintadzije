import { makeD1, makeKV, makeAssets } from "./harness.mjs";
const mod = await import(new URL("../functions/api/[[path]].js", import.meta.url).href);
const env = { DB: makeD1(), SLIKE: makeKV(), ASSETS: makeAssets(new URL("..", import.meta.url).pathname), ADMIN_EMAIL: "info.3dprinted@gmail.com" };
const mails = [];
globalThis.fetch = async (url, opts) => { if (String(url).includes("resend")) { mails.push(JSON.parse(opts.body)); return new Response("{}", { status: 200 }); } throw new Error("net " + url); };
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log("FAIL:", msg); } };
const jar = {};
async function call(who, method, path, body, extra = {}) {
  const headers = { Origin: "https://3dprintadzije.com", "CF-Connecting-IP": "1.2.3." + (who.length), ...(extra.headers || {}) };
  if (jar[who]) headers.Cookie = "sid=" + jar[who];
  let b;
  if (body instanceof FormData) b = body; else if (body) { headers["Content-Type"] = "application/json"; b = JSON.stringify(body); }
  const req = new Request("https://3dprintadzije.com/api/" + path, { method, headers, body: b });
  const res = await mod.onRequest({ request: req, env, params: { path: path.split("/") } });
  const sc = res.headers.get("Set-Cookie"); if (sc) { const m = sc.match(/sid=([^;]*)/); jar[who] = m[1] || undefined; }
  return { s: res.status, j: await res.json() };
}
// javno: prenos postojećih profila
let r = await call("anon", "GET", "public");
ok(r.s === 200 && r.j.profiles.length >= 2, "seed profiles " + JSON.stringify(r.j).slice(0, 200));
// registracija bez resend ključa
r = await call("ana", "POST", "auth/register", { email: "ana@test.ba", password: "tajna123", password2: "tajna123", terms: true });
ok(r.s === 200 && jar.ana, "register");
r = await call("x", "POST", "auth/register", { email: "ana@test.ba", password: "tajna123", password2: "tajna123", terms: true });
ok(r.s === 409, "dup register");
r = await call("x", "POST", "auth/register", { email: "b@test.ba", password: "tajna123", password2: "tajna124", terms: true });
ok(r.s === 400 && /podudaraju/.test(r.j.error), "pw mismatch");
r = await call("x", "POST", "auth/register", { email: "b@test.ba", password: "tajna123", password2: "tajna123", terms: true }, { headers: { Origin: "https://evil.com" } });
ok(r.s === 403, "origin check");
r = await call("ana", "GET", "me"); ok(r.s === 200 && r.j.user.email === "ana@test.ba" && !r.j.profile, "me");
// profil
r = await call("ana", "PUT", "me/profile", { naziv: "Ana Print", grad: "Tuzla", telefon: "+38761111222", uloge: ["printer"], printeri: ["Bambu Lab P1S"], plastika: [["PLA", "Crna", 1000]], web: "anaprint.ba", logo: "https://evil.com/x.png" });
ok(r.s === 200 && r.j.status === "pending" && r.j.id === "ana-print", "create profile " + JSON.stringify(r.j));
r = await call("anon", "GET", "public"); ok(!r.j.profiles.find((p) => p.id === "ana-print"), "pending hidden");
r = await call("ana", "GET", "me"); ok(r.j.profile.web === "https://anaprint.ba/" && r.j.profile.logo === "" && r.j.profile.email === "ana@test.ba", "profile sanitized " + JSON.stringify(r.j.profile));
// oglas
r = await call("ana", "POST", "me/ads", { kategorija: "filament", naslov: "eSun PLA crna", cijena: "38 KM", stanje: "Novo", slike: ["/slike/" + "a".repeat(32), "javascript:alert(1)"] });
ok(r.s === 200, "create ad"); const adId = r.j.id;
r = await call("ana", "GET", "me"); ok(r.j.ads.length === 1 && r.j.ads[0].slike.length === 1, "ad images sanitized");
r = await call("anon", "GET", "public"); ok(!r.j.ads.find((a) => a.id === adId), "ad hidden while profile pending");
// tuđi pristup
r = await call("eve", "POST", "auth/register", { email: "eve@test.ba", password: "tajna123", password2: "tajna123", terms: true });
r = await call("eve", "PUT", "me/ads/" + adId, { status: "sold" }); ok(r.s === 404, "cannot edit others ad");
r = await call("eve", "GET", "admin"); ok(r.s === 403, "non-admin blocked");
// admin
r = await call("adm", "POST", "auth/register", { email: "info.3dprinted@gmail.com", password: "adminpass1", password2: "adminpass1", terms: true });
r = await call("adm", "GET", "admin"); ok(r.s === 200 && r.j.profiles[0].status === "pending", "admin list");
r = await call("adm", "POST", "admin/profile", { id: "ana-print", status: "approved" }); ok(r.s === 200, "approve");
r = await call("anon", "GET", "public"); ok(r.j.profiles.find((p) => p.id === "ana-print") && r.j.ads.find((a) => a.id === adId), "visible after approve");
// statistika
await call("anon", "POST", "hit", { kind: "p", ref: "ana-print" });
await call("anon", "POST", "hit", { kind: "o", ref: adId });
await call("anon", "POST", "hit", { kind: "o", ref: adId, type: "contact" });
r = await call("ana", "GET", "me/stats"); ok(r.s === 200 && r.j.totals.length === 2, "stats " + JSON.stringify(r.j.totals));
// prodano / brisanje
r = await call("ana", "PUT", "me/ads/" + adId, { status: "sold" }); ok(r.s === 200, "sold");
r = await call("anon", "GET", "public"); ok(!r.j.ads.find((a) => a.id === adId), "sold hidden");
// slika
const fd = new FormData(); fd.append("file", new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }), "a.jpg");
r = await call("anon", "POST", "slika", fd); ok(r.s === 401, "upload requires login");
const fd2 = new FormData(); fd2.append("file", new Blob([new Uint8Array([255, 216, 255])], { type: "image/jpeg" }), "a.jpg");
r = await call("ana", "POST", "slika", fd2); ok(r.s === 200 && /^\/slike\/[a-f0-9]{32}$/.test(r.j.url), "upload");
// login / logout / pogrešna lozinka
r = await call("ana", "POST", "auth/logout"); ok(!jar.ana, "logout");
r = await call("ana", "POST", "auth/login", { email: "ana@test.ba", password: "pogresno1" }); ok(r.s === 401, "bad login");
r = await call("ana", "POST", "auth/login", { email: "ANA@test.ba", password: "tajna123" }); ok(r.s === 200 && jar.ana, "login");
// reset bez resend
r = await call("ana", "POST", "auth/forgot", { email: "ana@test.ba" }); ok(r.s === 503, "forgot w/o mail key");
// sa resend ključem: verify + claim + reset
env.RESEND_API_KEY = "test";
r = await call("jus", "POST", "auth/register", { email: "jusufagic@printyourfix.com", password: "tajna123", password2: "tajna123", terms: true });
ok(r.j.verifySent === true && mails.length === 1, "verify mail sent");
const vt = mails[0].text.match(/potvrdi=([\w-]+)/)[1];
r = await call("jus", "POST", "auth/verify", { token: vt }); ok(r.s === 200, "verify");
r = await call("jus", "GET", "me"); ok(r.j.profile && r.j.profile.id === "printyourfix" && r.j.user.verified, "claimed existing profile " + JSON.stringify(r.j.profile && r.j.profile.id));
r = await call("anon", "POST", "auth/forgot", { email: "ana@test.ba" }); ok(r.s === 200 && mails.length === 2, "forgot mail");
const rt = mails[1].text.match(/reset=([\w-]+)/)[1];
r = await call("anon2", "POST", "auth/reset", { token: rt, password: "novalozinka", password2: "novalozinka" }); ok(r.s === 200 && jar.anon2, "reset");
r = await call("ana", "GET", "me"); ok(r.s === 401, "old session invalid after reset");
r = await call("anon2", "POST", "auth/reset", { token: rt, password: "x12345678", password2: "x12345678" }); ok(r.s === 400, "token single use");
r = await call("ana", "POST", "auth/login", { email: "ana@test.ba", password: "novalozinka" }); ok(r.s === 200, "login new pw");
// promjena lozinke i brisanje naloga
r = await call("ana", "POST", "me/password", { old: "novalozinka", password: "treca1234", password2: "treca1234" }); ok(r.s === 200, "change pw");
r = await call("ana", "POST", "me/delete", { password: "treca1234" }); ok(r.s === 200, "delete account");
r = await call("anon", "GET", "public"); ok(!r.j.profiles.find((p) => p.id === "ana-print"), "deleted profile gone");
console.log(`PASS ${pass}  FAIL ${fail}`);
