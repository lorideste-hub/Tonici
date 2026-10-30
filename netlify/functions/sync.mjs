import { getStore } from "@netlify/blobs";
import { SEED } from "../lib/seed.mjs";
import { checkAuth } from "../lib/auth.mjs";
import { syncFromAreaSport } from "../lib/areasport.mjs";

// POST /api/sync -> aggiorna subito calendario, risultati, classifica e marcatori dal sito del campionato
export default async (req) => {
  if (req.method !== "POST") return new Response("Metodo non consentito", { status: 405 });
  const denied = checkAuth(req);
  if (denied) return denied;
  const store = getStore({ name: "gintonici", consistency: "strong" });
  const data = (await store.get("site", { type: "json" })) || structuredClone(SEED);
  try {
    const info = await syncFromAreaSport(data);
    data.aggiornato = new Date().toISOString();
    await store.setJSON("site", data);
    return Response.json({ ok: true, info, data });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 502 });
  }
};

export const config = { path: "/api/sync" };
