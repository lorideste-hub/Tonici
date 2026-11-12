// Formazione della partita: campo con i titolari al loro posto (stile fantacalcio) + panchina.
// La formazione la inserisce il mister dall'Admin (scheda Formazione) ed è salvata in data.formazioni:
//   [{ partitaId, modulo: "3-3-1", titolari: [idPortiere, ...difesa, ...centrocampo, ...attacco],
//      panchina: [id...], capitano: id, nota: "" }]

import { esc, fmtDate, matchPlayer } from "./common.js";

// Calciotto: portiere + 7 di movimento
export const MODULI = ["3-3-1", "3-2-2", "2-3-2", "3-1-3", "2-4-1", "4-2-1", "4-1-2"];
export const DEFAULT_MODULO = "3-3-1";

const REPARTI = [
  { key: "por", ruolo: "Portiere", label: "Portiere", sigla: "POR" },
  { key: "dif", ruolo: "Difensore", label: "Difesa", sigla: "DIF" },
  { key: "cen", ruolo: "Centrocampista", label: "Centrocampo", sigla: "CEN" },
  { key: "att", ruolo: "Attaccante", label: "Attacco", sigla: "ATT" },
];

// Posti del modulo, dal portiere all'attacco: [{reparto, ruolo, x, y}] (x,y in % sul campo verticale)
export function slots(modulo) {
  const linee = String(modulo || DEFAULT_MODULO).split("-").map(Number).filter((n) => n > 0);
  const Y = [86, 64, 42, 20]; // portiere, difesa, centrocampo, attacco
  const out = [{ reparto: REPARTI[0], x: 50, y: 88 }];
  linee.slice(0, 3).forEach((n, li) => {
    const span = n >= 4 ? 80 : n === 3 ? 66 : n === 2 ? 44 : 0;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 50 : 50 - span / 2 + (span * i) / (n - 1);
      out.push({ reparto: REPARTI[li + 1], x, y: Y[li + 1] });
    }
  });
  return out;
}

export const formazioneFor = (data, partitaId) => (data.formazioni || []).find((f) => f.partitaId === partitaId) || null;

// Presenze in campionato per giocatore della rosa (dalle distinte ufficiali)
export function presenzeMap(data) {
  const m = new Map();
  for (const p of data.partite || []) for (const n of p.distinta?.presenti || []) {
    const pl = matchPlayer(n, data.rosa);
    if (pl) m.set(pl.id, (m.get(pl.id) || 0) + 1);
  }
  return m;
}

const initials = (p) => (p?.nome || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
export const shortName = (p) => p.soprannome || String(p.nome || "").split(/\s+/).slice(-1)[0] || p.nome;

function face(p, cap) {
  return `<div class="fz-face">${p.foto ? `<img src="${esc(p.foto)}" alt="" loading="lazy">` : `<span>${esc(initials(p))}</span>`}
    ${p.numero !== "" && p.numero != null ? `<b class="fz-num">${esc(p.numero)}</b>` : ""}
    ${cap ? `<b class="fz-cap" title="Capitano">C</b>` : ""}</div>`;
}

// Campo con i titolari. Usato sia sul sito sia come anteprima nell'Admin.
export function pitchHTML(f, data) {
  const byId = new Map((data.rosa || []).map((p) => [p.id, p]));
  const pos = slots(f?.modulo);
  const players = pos.map((s, i) => {
    const p = byId.get(f?.titolari?.[i]);
    const style = `left:${s.x}%;top:${s.y}%`;
    if (!p) return `<div class="fz-player empty" style="${style}"><div class="fz-face"><span>?</span></div><div class="fz-name">${esc(s.reparto.sigla)}</div></div>`;
    return `<div class="fz-player" style="${style}">${face(p, f.capitano === p.id)}<div class="fz-name">${esc(shortName(p))}</div></div>`;
  }).join("");
  return `<div class="fz-pitch" role="img" aria-label="Formazione ${esc(f?.modulo || "")}">
    <svg class="fz-lines" viewBox="0 0 68 90" preserveAspectRatio="none" aria-hidden="true">
      <rect x="2" y="2" width="64" height="86" />
      <line x1="2" y1="45" x2="66" y2="45" />
      <circle cx="34" cy="45" r="8" />
      <circle cx="34" cy="45" r=".7" class="dot" />
      <rect x="16" y="72" width="36" height="16" />
      <rect x="26" y="82" width="16" height="6" />
      <rect x="16" y="2" width="36" height="16" />
      <rect x="26" y="2" width="16" height="6" />
    </svg>
    <div class="fz-modulo">${esc(f?.modulo || DEFAULT_MODULO)}</div>
    ${players}
  </div>`;
}

export function benchHTML(f, data) {
  const byId = new Map((data.rosa || []).map((p) => [p.id, p]));
  const inCampo = new Set(f?.titolari || []);
  const list = (f?.panchina || []).filter((id) => !inCampo.has(id)).map((id) => byId.get(id)).filter(Boolean);
  if (!list.length) return "";
  return `<div class="fz-bench"><div class="label">Panchina</div><div class="fz-bench-list">${list
    .map((p) => `<div class="fz-player bench">${face(p, f.capitano === p.id)}<div class="fz-name">${esc(shortName(p))}</div></div>`)
    .join("")}</div></div>`;
}

// Popup del sito pubblico
export function openFormazione(match, data) {
  const f = formazioneFor(data, match.id);
  const noi = data.squadra?.nome || "Gin Tonici F.C.";
  const casa = match.casa !== false;
  document.querySelector("dialog.formazione")?.remove();
  const dlg = document.createElement("dialog");
  dlg.className = "distinta formazione";
  dlg.innerHTML = `
    <form method="dialog" class="dist-head">
      <div>
        <div class="label">Formazione${match.giornata ? ` · ${esc(match.giornata)}ª giornata` : ""}</div>
        <h3>${esc(casa ? noi : match.avversario)} <span>–</span> ${esc(casa ? match.avversario : noi)}</h3>
        <div class="meta">${esc(fmtDate(match.data, true))}${match.ora ? ` · ore ${esc(match.ora)}` : ""}</div>
      </div>
      <button class="dist-x" aria-label="Chiudi">×</button>
    </form>
    <div class="fz-body">${
      f && (f.titolari || []).some(Boolean)
        ? `${f.nota ? `<p class="fz-nota">${esc(f.nota)}</p>` : ""}${pitchHTML(f, data)}${benchHTML(f, data)}`
        : `<p class="empty fz-none">Il mister non ha ancora diramato la formazione.<br>Nel dubbio, presentati in condizioni decenti.</p>`
    }</div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => dlg.remove());
  dlg.showModal();
}
