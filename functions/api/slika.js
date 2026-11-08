// POST /api/slika – prima jednu sliku (multipart, polje "file") i čuva je u Cloudflare KV (binding SLIKE).
// Vraća {url:"/slike/<id>"}. Slike se prikazuju na stranici tek kad ih admin objavi uz profil ili oglas.
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB (klijent ih prije slanja smanji na ~200 KB)

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function originAllowed(origin) {
  if (!origin) return false;
  try {
    const h = new URL(origin).hostname;
    return h === "3dprintadzije.com" || h === "www.3dprintadzije.com" || h === "3dprintadzije.pages.dev" || h.endsWith(".3dprintadzije.pages.dev") || h === "localhost";
  } catch { return false; }
}

export async function onRequestPost({ request, env }) {
  if (!env.SLIKE) return json({ error: "Pohrana slika još nije podešena." }, 503);
  if (!originAllowed(request.headers.get("Origin"))) return json({ error: "Nedozvoljen izvor." }, 403);
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.includes("multipart/form-data")) return json({ error: "Pogrešan format." }, 400);

  let form;
  try { form = await request.formData(); } catch { return json({ error: "Neispravan zahtjev." }, 400); }
  const file = form.get("file");
  if (!file || typeof file === "string") return json({ error: "Nema slike." }, 400);
  if (!ALLOWED_TYPES.includes(file.type)) return json({ error: "Dozvoljene su JPG, PNG i WEBP slike." }, 415);
  if (file.size > MAX_BYTES) return json({ error: "Slika je prevelika (max 2 MB)." }, 413);

  const id = crypto.randomUUID().replace(/-/g, "");
  await env.SLIKE.put(id, await file.arrayBuffer(), { metadata: { type: file.type, t: Date.now() } });
  return json({ url: `/slike/${id}` });
}

export function onRequest() {
  return json({ error: "Koristi POST." }, 405);
}
