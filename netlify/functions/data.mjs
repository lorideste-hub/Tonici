import { getStore } from "@netlify/blobs";
import { SEED } from "../lib/seed.mjs";

// GET /api/data -> tutti i contenuti del sito
export default async () => {
  const store = getStore({ name: "gintonici", consistency: "strong" });
  const data = (await store.get("site", { type: "json" })) || SEED;
  return Response.json(data, { headers: { "cache-control": "no-store" } });
};

export const config = { path: "/api/data" };
