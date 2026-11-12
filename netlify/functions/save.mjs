import { getStore } from "@netlify/blobs";
import { SEED, EMPTY } from "../lib/seed.mjs";
import { checkAuth } from "../lib/auth.mjs";

const SECTIONS = ["squadra", "societa", "rosa", "partite", "classifica", "pagelle", "foto", "link", "formazioni"];

// POST /api/save  { action: "login" } | { action: "reset" } | { section, value }
export default async (req) => {
  if (req.method !== "POST") return new Response("Metodo non consentito", { status: 405 });
  const denied = checkAuth(req);
  if (denied) return denied;

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON non valido" }, { status: 400 });
  }

  if (body.action === "login") return Response.json({ ok: true });

  const store = getStore({ name: "gintonici", consistency: "strong" });

  if (body.action === "reset") {
    const fresh = structuredClone(EMPTY);
    fresh.aggiornato = new Date().toISOString();
    await store.setJSON("site", fresh);
    return Response.json({ ok: true, data: fresh });
  }

  if (!SECTIONS.includes(body.section)) {
    return Response.json({ error: "Sezione sconosciuta" }, { status: 400 });
  }

  const data = (await store.get("site", { type: "json" })) || structuredClone(SEED);
  data[body.section] = body.value;
  if (body.section === "classifica") data.classificaAggiornata = new Date().toISOString();
  data.aggiornato = new Date().toISOString();
  await store.setJSON("site", data);
  return Response.json({ ok: true, data });
};

export const config = { path: "/api/save" };
