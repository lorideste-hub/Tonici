import { getStore } from "@netlify/blobs";
import { SEED } from "../lib/seed.mjs";
import { migra } from "../lib/migrazioni.mjs";

// GET /api/data -> tutti i contenuti del sito
export default async () => {
  const store = getStore({ name: "gintonici", consistency: "strong" });
  const saved = await store.get("site", { type: "json" });
  if (saved && migra(saved)) await store.setJSON("site", saved);
  const data = saved || SEED;
  return Response.json(data, { headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/data" };
