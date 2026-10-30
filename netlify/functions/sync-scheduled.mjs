import { getStore } from "@netlify/blobs";
import { SEED } from "../lib/seed.mjs";
import { syncFromAreaSport } from "../lib/areasport.mjs";

// Aggiornamento automatico dal sito del campionato, due volte al giorno
// (ore 6:30 e 23:30 italiane circa: gli orari cron sono in UTC).
export default async () => {
  const store = getStore({ name: "gintonici", consistency: "strong" });
  const data = (await store.get("site", { type: "json" })) || structuredClone(SEED);
  if (data.squadra?.syncAuto === false) return;
  try {
    const info = await syncFromAreaSport(data);
    data.aggiornato = new Date().toISOString();
    await store.setJSON("site", data);
    console.log("Sync ok", info);
  } catch (e) {
    console.error("Sync fallito:", e.message);
  }
};

export const config = { schedule: "30 5,22 * * *" };
