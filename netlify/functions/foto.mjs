import { getStore } from "@netlify/blobs";

// GET /api/foto/:key -> restituisce l'immagine caricata
export default async (req, context) => {
  const key = context.params.key;
  const store = getStore("gintonici-foto");
  const res = await store.getWithMetadata(key, { type: "arrayBuffer" });
  if (!res) return new Response("Foto non trovata", { status: 404 });
  return new Response(res.data, {
    headers: {
      "content-type": res.metadata?.contentType || "image/jpeg",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
};

export const config = { path: "/api/foto/:key" };
