# 3D Printadžije – 3dprintadzije.com

Imenik 3D printadžija i oglasi za plastiku, printere i dijelove u BiH. Sarajevo, BiH.

- `src/index.src.html` – izvor stranice; `./build.sh` pravi `index.html`
- `data/printadzije.json` – objavljeni (provjereni) profili
- `data/oglasi.json` – objavljeni oglasi
- Prijave i oglasi stižu na info.3dprinted@gmail.com (FormSubmit), objavljuju se nakon provjere.
- Hosting: Cloudflare Pages, automatski s grane `main`.

## Nalozi (od 9.11.2026)
- `functions/api/[[path]].js` – API: nalozi (email + lozinka, reset), Moj profil, oglasi, statistika, admin, upload slika
- `functions/slike/[id].js` – posluživanje slika iz KV
- Cloudflare postavke projekta: D1 binding `DB`, KV binding `SLIKE`, secret `RESEND_API_KEY`, varijable `ADMIN_EMAIL`, `MAIL_FROM`
- Testovi: `cd test && node api.test.mjs` (simulacija D1 preko node:sqlite)
