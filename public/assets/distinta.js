// Distinta di gara: scelta dei giocatori e compilazione del modulo ufficiale (PDF).
// Il modulo vuoto è /assets/distinta-template.pdf: per la stagione nuova basta sostituire quel file
// (se cambia l'impaginazione vanno ritoccate le coordinate in fillDistinta).

import { esc, fmtDate, matchPlayer, isAttivo } from "./common.js";
import { formazioneFor } from "./formazione.js";

export const MAX_GIOCATORI = 15;
const TEMPLATE_URL = "/assets/distinta-template.pdf";
const PDFLIB_URL = "/assets/vendor/pdf-lib.esm.min.js";
const STORE_KEY = "gt-distinta";

// ---------- DATI ----------

const PARTICELLE = new Set(["de", "di", "del", "della", "dello", "dei", "degli", "da", "dal", "dalla", "lo", "la", "li", "le", "van", "von"]);

// "Lorenzo De Stefano" -> "De Stefano Lorenzo" (usato solo se manca il nome ufficiale del campionato)
export function cognomeNome(nome) {
  const t = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (t.length < 2) return t.join(" ");
  let i = t.length - 1;
  while (i > 1 && PARTICELLE.has(t[i - 1].toLowerCase())) i--;
  return [...t.slice(i), ...t.slice(0, i)].join(" ");
}

// Giocatori selezionabili: chi ha più presenze in cima; a parità, ordine alfabetico (cognome).
// Le presenze sono quelle delle distinte ufficiali lette dal sito del campionato.
export function distintaPlayers(data) {
  // il nome si riconosce su tutta la rosa, ma le glorie del passato non finiscono tra le scelte
  const tutti = (data.rosa || []).filter((p) => p.ruolo !== "Staff");
  const rosa = tutti.filter(isAttivo);
  const presenze = new Map();
  const ufficiale = new Map();
  const extra = new Map();
  for (const p of data.partite || []) {
    for (const n of p.distinta?.presenti || []) {
      const pl = matchPlayer(n, tutti);
      if (pl && !isAttivo(pl)) continue;
      if (pl) {
        presenze.set(pl, (presenze.get(pl) || 0) + 1);
        ufficiale.set(pl, n);
      } else {
        const k = n.toLowerCase().replace(/\s+/g, " ").trim();
        const e = extra.get(k) || { key: `x:${k}`, numero: "", nome: n, soprannome: "", presenze: 0 };
        e.presenze++;
        extra.set(k, e);
      }
    }
  }
  for (const m of data.marcatoriUfficiali || []) {
    const pl = matchPlayer(m.nome, tutti);
    if (pl && !ufficiale.has(pl)) ufficiale.set(pl, m.nome);
  }
  const list = rosa.map((pl, i) => ({
    key: `r:${pl.id || i}`,
    numero: pl.numero ?? "",
    nome: (ufficiale.get(pl) || cognomeNome(pl.nome)).replace(/\s+/g, " ").trim(),
    soprannome: pl.soprannome || "",
    presenze: presenze.get(pl) || 0,
  }));
  return [...list, ...extra.values()].sort((a, b) => b.presenze - a.presenze || a.nome.localeCompare(b.nome, "it", { sensitivity: "base" }));
}

// Dati della testata, dal calendario ufficiale
export function distintaHeader(p, data) {
  const noi = data.squadra?.nomeUfficiale || data.squadra?.nome || "GIN TONICI FC";
  const casa = p.casa !== false;
  // Andata o ritorno: le giornate di un girone sono (squadre - 1)
  const squadre = (data.classifica || []).length;
  const perGirone = squadre > 1 ? squadre - 1 : Math.ceil(Math.max(0, ...(data.partite || []).map((x) => Number(x.giornata) || 0)) / 2);
  const g = Number(p.giornata) || 0;
  const campo = String(p.campo || "").toLowerCase().replace(/\s+/g, "");
  const serie = String(data.squadra?.campionato || "").match(/serie\s+([abc])\b/i);
  return {
    squadra: noi,
    colore: data.squadra?.coloreMaglia || "Nera",
    prima: casa ? noi : p.avversario || "",
    seconda: casa ? p.avversario || "" : noi,
    data: p.data || "",
    ora: p.ora || "",
    giornata: g || "",
    girone: g && perGirone ? (g <= perGirone ? "A" : "R") : "",
    campo: /3b/.test(campo) ? "3B" : /3a/.test(campo) ? "3A" : /4/.test(campo) ? "4" : "",
    campoTesto: p.campo || "",
    serie: serie ? serie[1].toUpperCase() : "",
  };
}

// ---------- PDF ----------

// Coordinate in punti, misurate dall'alto del foglio come nel modulo ufficiale 2026/27 (A4 595 x 842)
const BOX = {
  girone: { A: [226.1, 154.7], R: [244.1, 154.7] },
  campo: { 4: [322.2, 159.6], "3B": [367.9, 159.6], "3A": [415.2, 159.6] },
  serie: { A: [522.3, 148.5], B: [500.6, 159.0], C: [543.9, 159.0] },
};
const RIGHE = [220.2, 246.3, 272.3, 298.2, 324.3, 350.3, 376.2, 402.3, 428.3, 454.2, 480.3, 506.3, 532.3, 558.3, 584.3];

export async function fillDistinta(PDFLib, templateBytes, head, giocatori) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPage(0);
  const H = page.getHeight();
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.05, 0.05);

  // Solo caratteri che il font del modulo sa scrivere
  const safe = (s) =>
    [...String(s ?? "")].map((c) => {
      for (const k of [c, c.normalize("NFD").replace(/[̀-ͯ]/g, "")]) {
        try { font.encodeText(k); return k; } catch { /* prova senza accento */ }
      }
      return "";
    }).join("");
  // Scrive il testo; se non sta in maxW riduce il corpo. align: "l" da x, "c" centrato su x
  const text = (s, x, top, { size = 11, maxW = 0, align = "l", min = 6 } = {}) => {
    const t = safe(s).trim();
    if (!t) return;
    let sz = size;
    while (maxW && sz > min && font.widthOfTextAtSize(t, sz) > maxW) sz -= 0.25;
    const w = font.widthOfTextAtSize(t, sz);
    page.drawText(t, { x: align === "c" ? x - w / 2 : x, y: H - top, size: sz, font, color: ink });
  };
  const cross = ([cx, cy], r = 2.6) => {
    for (const s of [1, -1]) {
      page.drawLine({ start: { x: cx - r, y: H - cy - s * r }, end: { x: cx + r, y: H - cy + s * r }, thickness: 1.3, color: ink });
    }
  };

  text(head.squadra.toUpperCase(), 28, 100, { size: 13, maxW: 292 });
  text(head.colore.toUpperCase(), 478.4, 100, { size: 13, maxW: 150, align: "c" });
  text(head.prima.toUpperCase(), 26, 133, { size: 12, maxW: 212 });
  text(head.seconda.toUpperCase(), 304, 133, { size: 12, maxW: 202 });

  const d = String(head.data).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) {
    // Copre i segnaposto "/ / 202. .  H . .." e riscrive data e ora per intero
    page.drawRectangle({ x: 76, y: H - 160.5, width: 85, height: 12, color: rgb(1, 1, 1) });
    text(`${d[3]}/${d[2]}/${d[1]}`, 78, 158, { size: 8.5 });
    text(head.ora ? `H ${head.ora}` : "H . . .", 127, 158, { size: 8.5 });
  }
  if (head.giornata) text(String(head.giornata), 213, 157, { size: 9, align: "c" });
  if (BOX.girone[head.girone]) cross(BOX.girone[head.girone]);
  if (BOX.campo[head.campo]) cross(BOX.campo[head.campo]);
  if (BOX.serie[head.serie]) cross(BOX.serie[head.serie]);

  giocatori.slice(0, MAX_GIOCATORI).forEach((g, i) => {
    const base = RIGHE[i] + 17;
    text(g.numero, 37.3, base, { size: 12, align: "c", maxW: 30 });
    text(g.nome.toUpperCase(), 62, base, { size: 11, maxW: 204 });
  });

  pdf.setTitle(`Distinta ${head.prima} - ${head.seconda}`);
  return await pdf.save();
}

let assets;
// Libreria PDF e modulo vuoto: scaricati una volta, all'apertura della finestra
function loadAssets() {
  assets ||= Promise.all([
    import(PDFLIB_URL),
    fetch(TEMPLATE_URL).then((r) => {
      if (!r.ok) throw new Error(`modulo non trovato (${r.status})`);
      return r.arrayBuffer();
    }),
  ]).catch((e) => { assets = null; throw e; });
  return assets;
}

const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
const fileName = (h) => `Distinta_${h.giornata ? `G${String(h.giornata).padStart(2, "0")}_` : ""}${slug(h.prima)}_vs_${slug(h.seconda)}.pdf`;

// ---------- FINESTRA ----------

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function writeStore(v) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* navigazione privata: pazienza */ }
}

export function openDistinta(p, data) {
  const head = distintaHeader(p, data);
  const players = distintaPlayers(data);
  const saved = readStore();
  // Selezione iniziale: se per questa partita la distinta è già stata ritoccata, vale quella;
  // altrimenti, se il mister ha inserito la formazione, titolari + panchina; altrimenti l'ultima usata.
  const valid = (keys) => keys.filter((k) => players.some((x) => x.key === k)).slice(0, MAX_GIOCATORI);
  const f = formazioneFor(data, p.id);
  const fIds = f ? [...new Set([...(f.titolari || []), ...(f.panchina || [])].filter(Boolean))] : [];
  const daFormazione = valid(fIds.map((id) => `r:${id}`));
  let fonte = "";
  let initial;
  const fSig = fIds.join(",");
  // se il mister cambia la formazione dopo, riparte dalla formazione nuova
  if (saved.partitaId === p.id && (saved.fSig || "") === fSig && Array.isArray(saved.sel)) initial = valid(saved.sel);
  else if (daFormazione.length) { initial = daFormazione; fonte = `Già selezionati: ${daFormazione.length} giocatori della formazione (campo e panchina).`; }
  else initial = valid(saved.sel || []);
  const sel = new Set(initial);
  const numeri = saved.numeri || {};
  loadAssets().catch(() => {});

  document.querySelector("dialog.distinta")?.remove();
  const dlg = document.createElement("dialog");
  dlg.className = "distinta";
  const canShare = typeof navigator.canShare === "function" && typeof File === "function" &&
    (() => { try { return navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] }); } catch { return false; } })();
  dlg.innerHTML = `
    <form method="dialog" class="dist-head">
      <div>
        <div class="label">Distinta di gara${head.giornata ? ` · ${esc(head.giornata)}ª giornata` : ""}</div>
        <h3>${esc(head.prima)} <span>–</span> ${esc(head.seconda)}</h3>
        <div class="meta">${esc(fmtDate(head.data, true))}${head.ora ? ` · ore ${esc(head.ora)}` : ""}${head.campoTesto ? ` · ${esc(head.campoTesto)}` : ""} · maglia ${esc(head.colore.toLowerCase())}</div>
      </div>
      <button class="dist-x" aria-label="Chiudi">×</button>
    </form>
    <div class="dist-bar">
      <span><strong class="dist-n">0</strong> su ${MAX_GIOCATORI} in distinta</span>
      <button type="button" class="dist-clear">Deseleziona tutti</button>
    </div>
    <ul class="dist-list">${players.map((x) => `
      <li>
        <label>
          <input type="checkbox" value="${esc(x.key)}"${sel.has(x.key) ? " checked" : ""}>
          <span class="dist-name">${esc(x.nome)}${x.soprannome ? ` <em>${esc(x.soprannome)}</em>` : ""}</span>
        </label>
        <span class="dist-pres" title="Presenze in campionato">${x.presenze} pres.</span>
        <input class="dist-num" type="text" inputmode="numeric" maxlength="3" aria-label="Numero di maglia di ${esc(x.nome)}" placeholder="n°" data-key="${esc(x.key)}" value="${esc(numeri[x.key] ?? x.numero ?? "")}">
      </li>`).join("")}
    </ul>
    <p class="dist-msg" role="status"></p>
    <div class="dist-actions">
      <button type="button" class="btn lime" data-act="open">Apri e stampa</button>
      <button type="button" class="btn" data-act="download">Scarica PDF</button>
      ${canShare ? `<button type="button" class="btn ghost" data-act="share">Invia…</button>` : ""}
    </div>`;
  document.body.append(dlg);

  const boxes = [...dlg.querySelectorAll('.dist-list input[type="checkbox"]')];
  const msg = dlg.querySelector(".dist-msg");
  const refresh = () => {
    const n = boxes.filter((b) => b.checked).length;
    dlg.querySelector(".dist-n").textContent = n;
    for (const b of boxes) {
      b.disabled = !b.checked && n >= MAX_GIOCATORI;
      b.closest("li").classList.toggle("on", b.checked);
    }
    msg.textContent = n >= MAX_GIOCATORI ? `Raggiunto il massimo di ${MAX_GIOCATORI} giocatori.` : "";
    msg.classList.remove("err");
  };
  const chosen = () => {
    const nums = {};
    for (const i of dlg.querySelectorAll(".dist-num")) {
      const pl = players.find((x) => x.key === i.dataset.key);
      const v = i.value.trim();
      if (pl && v !== String(pl.numero ?? "")) nums[i.dataset.key] = v;
    }
    const keys = boxes.filter((b) => b.checked).map((b) => b.value);
    writeStore({ partitaId: p.id, fSig, sel: keys, numeri: nums });
    return players.filter((x) => keys.includes(x.key)).map((x) => ({ nome: x.nome, numero: nums[x.key] ?? x.numero ?? "" }));
  };
  dlg.addEventListener("change", (e) => { if (e.target.type === "checkbox") refresh(); });
  dlg.querySelector(".dist-clear").addEventListener("click", () => { boxes.forEach((b) => (b.checked = false)); refresh(); });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => { chosen(); dlg.remove(); });

  dlg.querySelector(".dist-actions").addEventListener("click", async (e) => {
    const act = e.target.closest("button")?.dataset.act;
    if (!act) return;
    const giocatori = chosen();
    if (!giocatori.length) {
      msg.textContent = "Scegli almeno un giocatore (o stai andando a giocare da solo?).";
      msg.classList.add("err");
      return;
    }
    // La scheda va aperta subito, nel clic: dopo l'attesa il browser la bloccherebbe
    const tab = act === "open" ? window.open("", "_blank") : null;
    const buttons = [...dlg.querySelectorAll(".dist-actions button")];
    buttons.forEach((b) => (b.disabled = true));
    msg.classList.remove("err");
    msg.textContent = "Compilo la distinta…";
    try {
      const [lib, tpl] = await loadAssets();
      const bytes = await fillDistinta(lib, tpl, head, giocatori);
      const name = fileName(head);
      const file = new File([bytes], name, { type: "application/pdf" });
      const url = URL.createObjectURL(file);
      setTimeout(() => URL.revokeObjectURL(url), 5 * 60000);
      const download = () => {
        const a = Object.assign(document.createElement("a"), { href: url, download: name });
        document.body.append(a); a.click(); a.remove();
      };
      if (act === "share") {
        try {
          await navigator.share({ files: [file], title: `Distinta ${head.prima} – ${head.seconda}` });
        } catch (err) {
          if (err?.name !== "AbortError") download();
        }
      } else if (tab) tab.location.href = url;
      else download();
      msg.textContent = act === "open" && tab ? "Distinta aperta in una nuova scheda: da lì si stampa." : act === "share" ? "" : `Scaricata: ${name}`;
    } catch (err) {
      console.error(err);
      tab?.close();
      msg.textContent = `Non riesco a compilare la distinta (${err.message}). Riprova.`;
      msg.classList.add("err");
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  });

  refresh();
  if (fonte && !msg.textContent) msg.textContent = fonte;
  dlg.showModal();
}
