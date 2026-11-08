// GET /slike/<id> – vraća sliku iz Cloudflare KV (binding SLIKE).
export async function onRequestGet({ params, env }) {
  if (!env.SLIKE) return new Response("Nije pronađeno", { status: 404 });
  const id = String(params.id || "").replace(/[^a-f0-9]/g, "");
  if (id.length !== 32) return new Response("Nije pronađeno", { status: 404 });
  const { value, metadata } = await env.SLIKE.getWithMetadata(id, { type: "arrayBuffer" });
  if (!value) return new Response("Nije pronađeno", { status: 404 });
  return new Response(value, {
    headers: {
      "Content-Type": (metadata && metadata.type) || "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
