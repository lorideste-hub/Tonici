import { getStore } from "@netlify/blobs";
import { checkAuth } from "../lib/auth.mjs";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

// POST /api/upload (body = immagine binaria) -> { key, url }
// DELETE /api/upload?key=... -> elimina la foto
export default async (req) => {
  const denied = checkAuth(req);
  if (denied) return denied;
  const store = getStore("gintonici-foto");

  if (req.method === "DELETE") {
    const key = new URL(req.url).searchParams.get("key");
    if (!key) return Response.json({ error: "key mancante" }, { status: 400 });
    await store.delete(key);
    return Response.json({ ok: true });
  }

  if (req.method !== "POST") return new Response("Metodo non consentito", { status: 405 });

  const type = (req.headers.get("content-type") || "").split(";")[0];
  if (!TYPES[type]) return Response.json({ error: "Formato immagine non supportato" }, { status: 400 });
  const buf = await req.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return Response.json({ error: "Immagine troppo grande" }, { status: 413 });

  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${TYPES[type]}`;
  await store.set(key, buf, { metadata: { contentType: type } });
  return Response.json({ ok: true, key, url: `/api/foto/${key}` });
};

export const config = { path: "/api/upload" };
