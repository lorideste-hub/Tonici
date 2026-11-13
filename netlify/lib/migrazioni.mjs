// Ritocchi una tantum ai dati salvati. Ogni migrazione ha un nome e gira una volta sola.

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// 13/11/2026: giocatori non più in rosa -> "Le glorie del passato" (fuori da formazione e distinta)
function glorie(data) {
  const nomi = ["emmanuel", "bottona", "melotto"];
  const sopr = ["raffa", "apo"];
  for (const p of data.rosa || []) {
    const n = norm(p.nome).split(/\s+/);
    if (nomi.some((x) => n.includes(x)) || sopr.includes(norm(p.soprannome).trim())) p.ex = true;
  }
}

const MIGRAZIONI = [
  { nome: "glorie-2026-11", run: glorie },
  // la prima passata è stata sovrascritta da un salvataggio della rosa fatto con l'Admin non ancora aggiornato
  { nome: "glorie-2026-11-bis", run: glorie },
];

// Restituisce true se ha modificato i dati
export function migra(data) {
  if (!data) return false;
  const fatte = new Set(data.migrazioni || []);
  let changed = false;
  for (const m of MIGRAZIONI) {
    if (fatte.has(m.nome)) continue;
    m.run(data);
    fatte.add(m.nome);
    changed = true;
  }
  if (changed) data.migrazioni = [...fatte];
  return changed;
}
