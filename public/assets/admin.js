import {
  esc, linkify, fmtDate, isPlayed, sortedMatches, parsePagelle, parseClassifica, DEFAULT_ORDER,
  sortedStandings, votoClass, uid, parseISODate, nextMatch, isAttivo,
} from "./common.js";
import { MODULI, DEFAULT_MODULO, slots, formazioneFor, presenzeMap, pitchHTML, benchHTML, shortName } from "./formazione.js";

let DATA = null;
let PWD = "";
let TAB = "pagelle";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------- utilità ----------
function toast(msg, err = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "show" + (err ? " err" : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = err ? "err" : ""), 3200);
}

async function api(path, { method = "POST", body, headers = {} } = {}) {
  const r = await fetch(path, {
    method,
    headers: { "x-admin-password": PWD, ...(body && !(body instanceof Blob) ? { "content-type": "application/json" } : {}), ...headers },
    body: body instanceof Blob ? body : body ? JSON.stringify(body) : undefined,
  });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j.error || `Errore ${r.status}`);
  return j;
}

async function save(section, label = "Salvato") {
  try {
    const j = await api("/api/save", { body: { section, value: DATA[section] } });
    DATA = j.data;
    toast(`${label} ✔`);
    return true;
  } catch (e) {
    toast(e.message, true);
    return false;
  }
}

// Aggiorna dal sito del campionato
async function syncNow(btn) {
  if (btn) btn.disabled = true;
  toast("Leggo il sito del campionato…");
  try {
    const j = await api("/api/sync");
    DATA = j.data;
    toast(`Aggiornato ✔ ${j.info.partite} partite, ${j.info.risultati ?? 0} risultati, ${j.info.distinte ?? 0} distinte, ${j.info.squadre} squadre, ${j.info.marcatori} marcatori`);
    renderTabs();
  } catch (e) {
    toast(e.message, true);
  } finally {
    if (btn) btn.disabled = false;
  }
}
const syncBox = () => `<div class="card sync-box">
  <div><strong>Aggiornamento automatico dal sito del campionato</strong>
  <div class="small">Calendario, risultati, classifica e marcatori si aggiornano da soli due volte al giorno.${DATA.ultimoSync ? ` Ultimo aggiornamento: ${new Date(DATA.ultimoSync).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}.` : ""}</div></div>
  <button class="btn lime" data-sync>Aggiorna adesso</button>
</div>`;
const bindSync = (el) => $$("[data-sync]", el).forEach((b) => b.addEventListener("click", () => syncNow(b)));

// Ridimensiona l'immagine nel browser prima di caricarla (max 1600px, JPEG)
async function resizeImage(file, max = 1600) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.84));
}
async function uploadImage(file) {
  const blob = await resizeImage(file);
  return api("/api/upload", { body: blob, headers: { "content-type": blob.type || "image/jpeg" } });
}

const matchLabel = (p) =>
  `${p.giornata ? p.giornata + "ª · " : ""}${fmtDate(p.data)} · ${p.casa === false ? "@" : "vs"} ${p.avversario}${isPlayed(p) ? ` (${p.gf}-${p.gs})` : ""}`;

// ---------- login ----------
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  PWD = $("#pwd").value;
  const msg = $("#login-msg");
  msg.className = "msg";
  msg.textContent = "Controllo…";
  try {
    await api("/api/save", { body: { action: "login" } });
    try { sessionStorage.setItem("gt-pwd", PWD); } catch {}
    await enter();
  } catch (err) {
    msg.className = "msg err";
    msg.textContent = err.message === "Failed to fetch" || /404|405/.test(err.message)
      ? "L'area Admin funziona solo sul sito pubblicato su Netlify."
      : err.message;
  }
});

async function enter() {
  const r = await fetch("/api/data", { cache: "no-store" });
  DATA = await r.json();
  $("#login").hidden = true;
  $("#panel").hidden = false;
  renderTabs();
}

(async () => {
  let saved = "";
  try { saved = sessionStorage.getItem("gt-pwd") || ""; } catch {}
  if (!saved) return;
  PWD = saved;
  try { await api("/api/save", { body: { action: "login" } }); await enter(); } catch {}
})();

// ---------- tabs ----------
const TABS = [
  ["pagelle", "Pagelle"],
  ["formazione", "Formazione"],
  ["risultato", "Risultato"],
  ["classifica", "Classifica"],
  ["calendario", "Calendario"],
  ["rosa", "Rosa"],
  ["foto", "Foto"],
  ["societa", "Società e link"],
  ["impostazioni", "Impostazioni"],
];

function renderTabs() {
  $("#demo-note").hidden = !DATA.demo;
  $("#tabs").innerHTML = TABS.map(([k, l]) => `<button role="tab" data-k="${k}" aria-selected="${k === TAB}">${l}</button>`).join("");
  $$("#tabs button").forEach((b) => b.addEventListener("click", () => { TAB = b.dataset.k; renderTabs(); }));
  const body = $("#tab-body");
  body.innerHTML = "";
  ({ pagelle: tabPagelle, formazione: tabFormazione, risultato: tabRisultato, classifica: tabClassifica, calendario: tabCalendario, rosa: tabRosa, foto: tabFoto, societa: tabSocieta, impostazioni: tabImpostazioni })[TAB](body);
}

// ---------- PAGELLE ----------
let editingPagella = null;

function pagellaToText(pg) {
  const lines = [];
  if (pg.titolo) lines.push(`Titolo: ${pg.titolo}`);
  if (pg.intro) lines.push(pg.intro, "");
  for (const v of pg.voti || []) lines.push(`${v.nome.toUpperCase()} ${v.voto === "–" ? "" : v.voto}: ${v.commento}${v.etichetta ? " " + v.etichetta : ""}`.replace(/\s+:/, ":"), "");
  if (pg.mvp) lines.push("", `MVP: ${pg.mvp}`);
  if (pg.flop) lines.push(`Flop: ${pg.flop}`);
  return lines.join("\n");
}

function tabPagelle(el) {
  const matches = sortedMatches(DATA).filter(isPlayed).reverse();
  const withPag = new Set((DATA.pagelle || []).map((p) => p.partitaId));
  const def = editingPagella?.partitaId || (matches.find((m) => !withPag.has(m.id)) || matches[0])?.id || "";
  el.innerHTML = `
  <div class="card">
    <h3>${editingPagella ? "Modifica pagelle" : "Nuove pagelle"}</h3>
    <div class="help">Incolla le pagelle così come le scrivete: <strong>un paragrafo per giocatore</strong> che inizia con il NOME IN MAIUSCOLO, il <strong>voto</strong> e i due punti. L'etichetta finale in maiuscolo diventa il "titolo" del giocatore.
      Voti accettati: <code>6,5</code> <code>6½</code> <code>6+</code> <code>5-</code> <code>sv</code>. Facoltativi: una riga <code>Titolo: …</code> in cima, e righe <code>MVP: …</code> / <code>Flop: …</code> (se mancano li sceglie il sito dal voto più alto e più basso).
      <pre>Titolo: Sette bicchieri a Sheffield

BAFFA 8,5: Ma devo veramente scriverla? Non basta il coro fatto su misura per lui??? BAFFA GOOOOL

LORI 7: Dalle sue parti non si passa… O’ PROFESSO’</pre>
      Va bene anche lo stile breve: <code>Baffa 8,5 - tripletta</code>.</div>
    <div class="row">
      <div><label for="pg-match">Partita</label>
        <select id="pg-match">${matches.length ? matches.map((m) => `<option value="${m.id}"${m.id === def ? " selected" : ""}>${esc(matchLabel(m))}${withPag.has(m.id) && m.id !== editingPagella?.partitaId ? " ✓" : ""}</option>`).join("") : `<option value="">Prima inserisci un risultato</option>`}</select>
      </div>
      <div><label for="pg-photo">Foto (facoltativa)</label><input type="file" id="pg-photo" accept="image/*"></div>
    </div>
    <label for="pg-text">Testo delle pagelle</label>
    <textarea id="pg-text" placeholder="Incolla qui…" style="min-height:280px">${esc(editingPagella ? pagellaToText(editingPagella) : "")}</textarea>
    <div class="actions">
      <button class="btn ghost" id="pg-preview">Anteprima</button>
      <button class="btn lime" id="pg-save">Pubblica</button>
      ${editingPagella ? `<button class="btn ghost" id="pg-cancel">Annulla modifica</button>` : ""}
    </div>
    <div id="pg-out"></div>
  </div>
  <div class="card section">
    <h3>Pagelle pubblicate</h3>
    ${(DATA.pagelle || []).length ? `<table class="edit-table"><tbody>${[...DATA.pagelle].sort((a, b) => (b.data || "").localeCompare(a.data || "")).map((pg) => {
      const m = (DATA.partite || []).find((x) => x.id === pg.partitaId);
      return `<tr><td>${esc(pg.titolo || "Pagelle")}<div class="small">${m ? esc(matchLabel(m)) : fmtDate(pg.data)}</div></td>
        <td style="width:1%;white-space:nowrap"><button class="btn sm ghost" data-edit="${pg.id}">Modifica</button> <button class="icon-btn" data-del="${pg.id}" title="Elimina">✕</button></td></tr>`;
    }).join("")}</tbody></table>` : `<p class="empty">Nessuna pagella pubblicata.</p>`}
  </div>`;

  const preview = () => {
    const p = parsePagelle($("#pg-text").value);
    $("#pg-out").innerHTML = `<div class="preview">
      <h4>Anteprima · ${p.voti.length} voti letti</h4>
      ${p.titolo ? `<p><strong>${esc(p.titolo)}</strong></p>` : `<p class="small">Nessun titolo: verrà usato quello automatico.</p>`}
      ${p.intro ? `<p class="small" style="white-space:pre-line">${linkify(p.intro)}</p>` : ""}
      <p>🍋 MVP: <strong>${esc(p.mvp || "–")}</strong> · 🫧 Flop: <strong>${esc(p.flop || "–")}</strong></p>
      <div class="votes">${p.voti.map((v) => `<div class="vote"><div class="vnum ${votoClass(v.valore)}">${esc(v.voto)}</div><div><div class="who">${esc(v.nome)}</div>${v.etichetta ? `<div class="etichetta">${esc(v.etichetta)}</div>` : ""}<div class="what">${linkify(v.commento)}</div></div></div>`).join("")}</div>
      ${p.voti.some((v) => v.valore === null && v.voto === "–") ? `<p class="msg err">Alcuni giocatori sono senza voto: aggiungilo dopo il nome (es. <code>BAFFA 8,5: …</code>).</p>` : ""}
      ${!p.voti.length ? `<p class="msg err">Non ho trovato voti: controlla che ogni riga sia "Nome voto commento".</p>` : ""}
    </div>`;
    return p;
  };
  $("#pg-preview").addEventListener("click", preview);
  $("#pg-cancel")?.addEventListener("click", () => { editingPagella = null; renderTabs(); });
  $("#pg-save").addEventListener("click", async () => {
    const p = preview();
    const partitaId = $("#pg-match").value;
    if (!partitaId) return toast("Seleziona una partita", true);
    if (!p.voti.length) return toast("Nessun voto trovato", true);
    const btn = $("#pg-save");
    btn.disabled = true;
    try {
      let foto = editingPagella?.foto || "";
      const file = $("#pg-photo").files[0];
      if (file) foto = (await uploadImage(file)).url;
      const m = DATA.partite.find((x) => x.id === partitaId);
      const titolo = p.titolo || (m ? `${DATA.squadra?.nome || "Gin Tonici"} ${m.gf}-${m.gs} ${m.avversario}` : "Pagelle");
      const pg = {
        id: editingPagella?.id || uid("pg"),
        partitaId,
        titolo,
        data: editingPagella?.data || new Date().toISOString().slice(0, 10),
        intro: p.intro,
        voti: p.voti,
        mvp: p.mvp,
        flop: p.flop,
        foto,
      };
      DATA.pagelle = (DATA.pagelle || []).filter((x) => x.id !== pg.id && !(x.partitaId === partitaId && !editingPagella));
      DATA.pagelle.push(pg);
      if (await save("pagelle", "Pagelle pubblicate")) { editingPagella = null; renderTabs(); }
    } catch (e) {
      toast(e.message, true);
    } finally {
      btn.disabled = false;
    }
  });
  $$("[data-edit]", el).forEach((b) => b.addEventListener("click", () => {
    editingPagella = DATA.pagelle.find((x) => x.id === b.dataset.edit);
    renderTabs();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  $$("[data-del]", el).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Eliminare queste pagelle?")) return;
    DATA.pagelle = DATA.pagelle.filter((x) => x.id !== b.dataset.del);
    if (await save("pagelle", "Pagelle eliminate")) renderTabs();
  }));
}

// ---------- RISULTATO ----------
function tabRisultato(el) {
  const list = sortedMatches(DATA);
  if (!list.length) {
    el.innerHTML = `<div class="card"><p class="empty">Il calendario è vuoto: inserisci prima le partite nella scheda Calendario.</p></div>`;
    return;
  }
  const today = new Date(); today.setHours(23, 59, 0, 0);
  const pending = list.filter((p) => !isPlayed(p) && p.data && parseISODate(p.data) <= today);
  const def = (pending[pending.length - 1] || list.filter(isPlayed).pop() || list[0]).id;
  el.innerHTML = `${syncBox()}<div class="card section">
    <h3>Correggi o completa un risultato</h3>
    <div class="help">Normalmente non serve: i risultati arrivano dal sito del campionato. Qui puoi inserirli prima che vengano pubblicati, oppure aggiungere i <strong>marcatori della singola partita</strong> (separati da virgola: <code>Baffa 2, Carocci</code>), che compaiono nel riquadro dell'ultimo risultato. Attenzione: al prossimo aggiornamento automatico il punteggio ufficiale sovrascrive quello inserito a mano.</div>
    <label for="r-match">Partita</label>
    <select id="r-match">${list.map((p) => `<option value="${p.id}"${p.id === def ? " selected" : ""}>${esc(matchLabel(p))}</option>`).join("")}</select>
    <div class="row">
      <div><label for="r-gf">Gol fatti</label><input id="r-gf" type="number" min="0" inputmode="numeric"></div>
      <div><label for="r-gs">Gol subiti</label><input id="r-gs" type="number" min="0" inputmode="numeric"></div>
    </div>
    <label for="r-sc">Marcatori</label>
    <input id="r-sc" placeholder="Conti 2, Rossi">
    <div class="actions">
      <button class="btn lime" id="r-save">Salva risultato</button>
      <button class="btn ghost" id="r-clear">Cancella risultato</button>
    </div>
  </div>`;
  const fill = () => {
    const p = DATA.partite.find((x) => x.id === $("#r-match").value);
    $("#r-gf").value = p.gf ?? "";
    $("#r-gs").value = p.gs ?? "";
    $("#r-sc").value = p.marcatori || "";
  };
  fill();
  $("#r-match").addEventListener("change", fill);
  bindSync(el);
  $("#r-save").addEventListener("click", async () => {
    const p = DATA.partite.find((x) => x.id === $("#r-match").value);
    if ($("#r-gf").value === "" || $("#r-gs").value === "") return toast("Inserisci entrambi i punteggi", true);
    p.gf = Number($("#r-gf").value);
    p.gs = Number($("#r-gs").value);
    p.marcatori = $("#r-sc").value.trim();
    if (await save("partite", "Risultato salvato")) renderTabs();
  });
  $("#r-clear").addEventListener("click", async () => {
    const p = DATA.partite.find((x) => x.id === $("#r-match").value);
    p.gf = null; p.gs = null; p.marcatori = "";
    if (await save("partite", "Risultato cancellato")) renderTabs();
  });
}

// ---------- FORMAZIONE ----------
let fzDraft = null;

function tabFormazione(el) {
  const list = sortedMatches(DATA);
  if (!list.length) {
    el.innerHTML = `<div class="card"><p class="empty">Il calendario è vuoto: inserisci prima le partite nella scheda Calendario.</p></div>`;
    return;
  }
  const next = nextMatch(DATA);
  if (!fzDraft || !list.some((p) => p.id === fzDraft.partitaId)) fzDraft = loadDraft((next || list[list.length - 1]).id);
  const rosa = (DATA.rosa || []).filter(isAttivo);
  const pres = presenzeMap(DATA);
  const byId = new Map(rosa.map((p) => [p.id, p]));
  const label = (p) => `${shortName(p)}${p.soprannome ? ` – ${p.nome}` : ""} · ${pres.get(p.id) || 0} pres.`;
  const ordered = (ruolo) => [...rosa].sort((a, b) => {
    const fit = (p) => (p.ruolo === ruolo ? 0 : !p.ruolo || p.ruolo === "Jolly" ? 1 : 2);
    return fit(a) - fit(b) || (pres.get(b.id) || 0) - (pres.get(a.id) || 0) || shortName(a).localeCompare(shortName(b), "it");
  });
  const pos = slots(fzDraft.modulo);
  const saved = !!formazioneFor(DATA, fzDraft.partitaId);

  let lastRep = "";
  const slotRows = pos.map((s, i) => {
    const head = s.reparto.key !== lastRep ? `<div class="fz-rep">${esc(s.reparto.label)}</div>` : "";
    lastRep = s.reparto.key;
    const cur = fzDraft.titolari[i] || "";
    return `${head}<select data-slot="${i}" aria-label="${esc(s.reparto.ruolo)} ${i}">
      <option value="">— ${esc(s.reparto.ruolo)} —</option>
      ${ordered(s.reparto.ruolo).map((p) => `<option value="${esc(p.id)}"${p.id === cur ? " selected" : ""}>${esc(label(p))}${p.ruolo && p.ruolo !== s.reparto.ruolo ? ` (${esc(p.ruolo.toLowerCase())})` : ""}</option>`).join("")}
    </select>`;
  }).join("");

  const inCampo = new Set(fzDraft.titolari.filter(Boolean));
  const benchList = [...rosa].filter((p) => !inCampo.has(p.id))
    .sort((a, b) => (pres.get(b.id) || 0) - (pres.get(a.id) || 0) || shortName(a).localeCompare(shortName(b), "it"));
  const convocati = [...fzDraft.titolari.filter(Boolean), ...fzDraft.panchina].map((id) => byId.get(id)).filter(Boolean);

  el.innerHTML = `<div class="card">
    <h3>Formazione</h3>
    <div class="help">Scegli la partita e il modulo, poi metti i giocatori al loro posto in base a chi c'è. Nei menu i giocatori del ruolo giusto sono in cima, ordinati per presenze. In Home, sotto a Prossima partita, il pulsante <strong>Formazione</strong> mostra il campo con le facce.</div>
    <div class="row">
      <div><label for="fz-match">Partita</label>
        <select id="fz-match">${list.map((p) => `<option value="${p.id}"${p.id === fzDraft.partitaId ? " selected" : ""}>${esc(matchLabel(p))}${formazioneFor(DATA, p.id) ? " ✔" : ""}</option>`).join("")}</select></div>
      <div><label for="fz-modulo">Modulo</label>
        <select id="fz-modulo">${MODULI.map((m) => `<option${m === fzDraft.modulo ? " selected" : ""}>${m}</option>`).join("")}</select></div>
    </div>
    <div class="fz-admin">
      <div>
        <label>Titolari</label>
        <div class="fz-slots">${slotRows}</div>
        <label>Panchina</label>
        <div class="fz-benchpick">${benchList.length ? benchList.map((p) => `<label class="fz-check"><input type="checkbox" value="${esc(p.id)}"${fzDraft.panchina.includes(p.id) ? " checked" : ""}> ${esc(label(p))}</label>`).join("") : `<span class="small">Tutta la rosa è in campo.</span>`}</div>
        <div class="row">
          <div><label for="fz-cap">Capitano</label>
            <select id="fz-cap"><option value="">—</option>${convocati.map((p) => `<option value="${esc(p.id)}"${p.id === fzDraft.capitano ? " selected" : ""}>${esc(shortName(p))}</option>`).join("")}</select></div>
        </div>
        <label for="fz-nota">Messaggio del mister (facoltativo)</label>
        <input id="fz-nota" placeholder="Es. ritrovo alle 20:45, chi arriva tardi offre il giro" value="${esc(fzDraft.nota || "")}">
      </div>
      <div><label>Anteprima</label>${pitchHTML(fzDraft, DATA)}${benchHTML(fzDraft, DATA)}</div>
    </div>
    <div class="actions">
      <button class="btn lime" id="fz-save">Pubblica formazione</button>
      ${saved ? `<button class="btn ghost" id="fz-del">Togli formazione</button>` : ""}
      <span class="small">${saved ? "Già pubblicata: salvando la aggiorni." : "Non ancora pubblicata."}</span>
    </div>
  </div>`;

  $("#fz-match").addEventListener("change", (e) => { fzDraft = loadDraft(e.target.value); renderTabs(); });
  $("#fz-modulo").addEventListener("change", (e) => { fzDraft = changeModulo(fzDraft, e.target.value); renderTabs(); });
  $$("[data-slot]", el).forEach((sel) => sel.addEventListener("change", () => {
    const i = Number(sel.dataset.slot);
    const id = sel.value;
    if (id) {
      fzDraft.titolari = fzDraft.titolari.map((x, k) => (k !== i && x === id ? "" : x));
      fzDraft.panchina = fzDraft.panchina.filter((x) => x !== id);
    }
    fzDraft.titolari[i] = id;
    readExtras();
    renderTabs();
  }));
  $$(".fz-benchpick input", el).forEach((cb) => cb.addEventListener("change", () => {
    fzDraft.panchina = $$(".fz-benchpick input:checked", el).map((x) => x.value);
    readExtras();
    renderTabs();
  }));
  $("#fz-cap").addEventListener("change", () => { readExtras(); renderTabs(); });
  function readExtras() {
    fzDraft.capitano = $("#fz-cap").value;
    fzDraft.nota = $("#fz-nota").value.trim();
  }
  $("#fz-save").addEventListener("click", async () => {
    readExtras();
    const n = fzDraft.titolari.filter(Boolean).length;
    if (!n) return toast("Metti almeno un giocatore in campo", true);
    if (n < pos.length && !confirm(`In campo ci sono solo ${n} giocatori su ${pos.length}. Pubblico lo stesso?`)) return;
    const f = { ...fzDraft, aggiornata: new Date().toISOString() };
    const keep = (DATA.formazioni || []).filter((x) => x.partitaId !== f.partitaId);
    DATA.formazioni = [...keep, f];
    if (await save("formazioni", "Formazione pubblicata")) renderTabs();
  });
  $("#fz-del")?.addEventListener("click", async () => {
    if (!confirm("Togliere la formazione pubblicata per questa partita?")) return;
    DATA.formazioni = (DATA.formazioni || []).filter((x) => x.partitaId !== fzDraft.partitaId);
    if (await save("formazioni", "Formazione tolta")) { fzDraft = loadDraft(fzDraft.partitaId); renderTabs(); }
  });
}

function loadDraft(partitaId) {
  const f = formazioneFor(DATA, partitaId);
  if (f) return structuredClone({ panchina: [], capitano: "", nota: "", ...f, titolari: [...(f.titolari || [])] });
  // Nuova formazione: parte dal modulo dell'ultima pubblicata
  const last = [...(DATA.formazioni || [])].sort((a, b) => (b.aggiornata || "").localeCompare(a.aggiornata || ""))[0];
  const modulo = last?.modulo || DEFAULT_MODULO;
  return { partitaId, modulo, titolari: slots(modulo).map(() => ""), panchina: [], capitano: "", nota: "" };
}

// Cambio modulo: ogni giocatore resta nel suo reparto finché c'è posto, gli altri riempiono i posti liberi o vanno in panchina
function changeModulo(f, modulo) {
  const oldPos = slots(f.modulo);
  const newPos = slots(modulo);
  const pool = {};
  oldPos.forEach((s, i) => { if (f.titolari[i]) (pool[s.reparto.key] ||= []).push(f.titolari[i]); });
  const titolari = newPos.map((s) => (pool[s.reparto.key] || []).shift() || "");
  const rest = Object.values(pool).flat();
  for (let i = 0; i < titolari.length && rest.length; i++) if (!titolari[i]) titolari[i] = rest.shift();
  return { ...f, modulo, titolari, panchina: [...rest, ...f.panchina.filter((x) => !rest.includes(x))] };
}

// ---------- CLASSIFICA ----------
function tableHTML(rows) {
  const v = (x) => (x === undefined ? "–" : esc(x));
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th class="l">Squadra</th><th>Pt</th><th>G</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th></tr></thead><tbody>${rows
    .map((r, i) => `<tr><td>${i + 1}</td><td class="l">${esc(r.squadra)}</td><td><strong>${v(r.pt)}</strong></td><td>${v(r.g)}</td><td>${v(r.v)}</td><td>${v(r.n)}</td><td>${v(r.p)}</td><td>${v(r.gf)}</td><td>${v(r.gs)}</td></tr>`)
    .join("")}</tbody></table></div>`;
}

function tabClassifica(el) {
  let order = DEFAULT_ORDER;
  try { order = localStorage.getItem("gt-order") || DEFAULT_ORDER; } catch {}
  el.innerHTML = `${syncBox()}<div class="card section">
    <h3>Piano B: incolla la classifica a mano</h3>
    <div class="help">Apri la classifica sul sito del campionato${DATA.squadra?.linkCampionato ? ` (<a href="${esc(DATA.squadra.linkCampionato)}" target="_blank" rel="noopener">eccolo</a>)` : ""}, seleziona la tabella col mouse (o tenendo premuto da telefono), copia e incolla qui sotto. Le righe di intestazione vengono ignorate.
    Se i numeri finiscono nelle colonne sbagliate, cambia l'<strong>ordine delle colonne</strong> scrivendole come compaiono sul sito (es. <code>pos pt g v n p gf gs dr</code>). Usa <code>x</code> per una colonna da ignorare.</div>
    <label for="c-order">Ordine delle colonne numeriche</label>
    <input id="c-order" value="${esc(order)}">
    <label for="c-text">Tabella incollata</label>
    <textarea id="c-text" placeholder="1  Dinamo Divano  10  4  3  1  0  14  6  8"></textarea>
    <div class="actions">
      <button class="btn ghost" id="c-preview">Anteprima</button>
      <button class="btn lime" id="c-save">Pubblica classifica</button>
    </div>
    <div id="c-out"></div>
  </div>
  <div class="card section"><h3>Classifica attuale</h3>${DATA.classifica?.length ? tableHTML(sortedStandings(DATA)) : `<p class="empty">Vuota.</p>`}</div>`;
  const preview = () => {
    const rows = parseClassifica($("#c-text").value, $("#c-order").value);
    $("#c-out").innerHTML = `<div class="preview"><h4>Anteprima · ${rows.length} squadre</h4>${rows.length ? tableHTML(rows) : `<p class="msg err">Non ho riconosciuto righe valide.</p>`}</div>`;
    return rows;
  };
  $("#c-preview").addEventListener("click", preview);
  bindSync(el);
  $("#c-save").addEventListener("click", async () => {
    const rows = preview();
    if (!rows.length) return toast("Nessuna riga valida", true);
    try { localStorage.setItem("gt-order", $("#c-order").value); } catch {}
    DATA.classifica = rows;
    if (await save("classifica", "Classifica pubblicata")) renderTabs();
  });
}

// ---------- CALENDARIO ----------
function parseDateIT(s) {
  s = s.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?$/);
  if (!m) return "";
  let y = m[3] ? Number(m[3]) : new Date().getFullYear();
  if (y < 100) y += 2000;
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function tabCalendario(el) {
  const rows = sortedMatches(DATA);
  el.innerHTML = `<div class="card">
    <h3>Partite</h3>
    <div class="table-wrap"><table class="edit-table"><thead><tr><th>Giornata</th><th>Data</th><th>Ora</th><th class="l">Avversario</th><th>Dove</th><th>GF</th><th>GS</th><th></th></tr></thead>
    <tbody id="cal-body">${rows.map(rowHTML).join("")}</tbody></table></div>
    <div class="actions">
      <button class="btn ghost" id="cal-add">+ Aggiungi partita</button>
      <button class="btn lime" id="cal-save">Salva calendario</button>
    </div>
  </div>
  <div class="card section">
    <h3>Importa più partite insieme</h3>
    <div class="help">Una partita per riga, campi separati da <code>;</code> → <code>giornata; data; ora; avversario; casa/trasferta</code><pre>5; 02/11/2026; 21:55; Olimpia Panchina; casa
6; 09/11/2026; 21:00; Polisportiva Pastasciutta; trasferta</pre></div>
    <textarea id="cal-bulk" style="min-height:140px"></textarea>
    <div class="actions"><button class="btn ghost" id="cal-import">Aggiungi alla tabella</button></div>
  </div>`;
  function rowHTML(p) {
    return `<tr data-id="${esc(p.id)}">
      <td><input class="n" type="number" name="giornata" value="${esc(p.giornata ?? "")}"></td>
      <td><input class="d" type="date" name="data" value="${esc(p.data || "")}"></td>
      <td><input class="t" type="time" name="ora" value="${esc(p.ora || "")}"></td>
      <td><input name="avversario" value="${esc(p.avversario || "")}"></td>
      <td><select name="casa"><option value="1"${p.casa !== false ? " selected" : ""}>Casa</option><option value="0"${p.casa === false ? " selected" : ""}>Trasferta</option></select></td>
      <td><input class="n" type="number" min="0" name="gf" value="${esc(p.gf ?? "")}"></td>
      <td><input class="n" type="number" min="0" name="gs" value="${esc(p.gs ?? "")}"></td>
      <td><button class="icon-btn" data-rm title="Elimina">✕</button></td>
    </tr>`;
  }
  const bindRm = () => $$("[data-rm]", el).forEach((b) => (b.onclick = () => b.closest("tr").remove()));
  bindRm();
  const addRows = (list) => { $("#cal-body").insertAdjacentHTML("beforeend", list.map(rowHTML).join("")); bindRm(); };
  $("#cal-add").addEventListener("click", () => {
    const max = Math.max(0, ...$$("#cal-body [name=giornata]").map((i) => Number(i.value) || 0));
    addRows([{ id: uid("g"), giornata: max + 1, casa: true }]);
  });
  $("#cal-import").addEventListener("click", () => {
    const list = $("#cal-bulk").value.split(/\r?\n/).map((l) => l.split(/[;\t|]/).map((s) => s.trim())).filter((f) => f.length >= 4 && f[3])
      .map((f) => ({ id: uid("g"), giornata: Number(f[0]) || "", data: parseDateIT(f[1] || ""), ora: (f[2] || "").replace(".", ":"), avversario: f[3], casa: !/^(t|trasf|fuori|away)/i.test(f[4] || "") }));
    if (!list.length) return toast("Nessuna riga valida", true);
    addRows(list);
    $("#cal-bulk").value = "";
    toast(`${list.length} partite aggiunte: ricordati di salvare`);
  });
  $("#cal-save").addEventListener("click", async () => {
    const old = new Map((DATA.partite || []).map((p) => [p.id, p]));
    DATA.partite = $$("#cal-body tr").map((tr) => {
      const g = (n) => $(`[name=${n}]`, tr).value;
      const prev = old.get(tr.dataset.id) || {};
      return {
        ...prev,
        id: tr.dataset.id,
        giornata: g("giornata") === "" ? "" : Number(g("giornata")),
        data: g("data"),
        ora: g("ora"),
        avversario: g("avversario").trim(),
        casa: g("casa") === "1",
        gf: g("gf") === "" ? null : Number(g("gf")),
        gs: g("gs") === "" ? null : Number(g("gs")),
        marcatori: prev.marcatori || "",
      };
    }).filter((p) => p.avversario);
    if (await save("partite", "Calendario salvato")) renderTabs();
  });
}

// ---------- ROSA ----------
const RUOLI = ["", "Portiere", "Difensore", "Centrocampista", "Attaccante", "Jolly", "Staff"];

function tabRosa(el) {
  const rosa = DATA.rosa || [];
  el.innerHTML = `<div class="card">
    <h3>Rosa</h3>
    <div class="help">Soprannome e "altri nomi" collegano le pagelle al giocatore (es. Isacco Rossi è IGOR ma in pagella diventa ISIS). Del compleanno si pubblicano solo giorno e mese. Chi non è più in rosa spuntalo come <strong>Gloria del passato</strong>: resta nella pagina Squadra in una sezione a parte, ma non compare più in formazione, distinta e simulazione.</div>
    <div id="rosa-list">${rosa.map(playerHTML).join("")}</div>
    <div class="actions">
      <button class="btn ghost" id="rosa-add">+ Aggiungi giocatore</button>
      <button class="btn lime" id="rosa-save">Salva rosa</button>
    </div>
  </div>`;
  function playerHTML(p) {
    const initials = (p.nome || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    return `<div class="player-edit${p.ex ? " is-ex" : ""}" data-id="${esc(p.id)}" data-foto="${esc(p.foto || "")}">
      <div><div class="avatar">${p.foto ? `<img src="${esc(p.foto)}" alt="">` : esc(initials)}</div></div>
      <div>
        <div class="fields">
          <input name="numero" type="number" placeholder="N°" value="${esc(p.numero ?? "")}">
          <input name="nome" placeholder="Nome e cognome" value="${esc(p.nome || "")}">
          <input name="soprannome" placeholder="Soprannome" value="${esc(p.soprannome || "")}">
          <select name="ruolo">${RUOLI.map((r) => `<option value="${r}"${r === (p.ruolo || "") ? " selected" : ""}>${r || "Ruolo…"}</option>`).join("")}</select>
          <input class="wide" name="alias" placeholder="Altri nomi usati nelle pagelle (separati da virgola)" value="${esc(p.alias || "")}">
          <input name="compleanno" placeholder="gg/mm" title="Compleanno (solo giorno e mese)" value="${esc(p.compleanno ? p.compleanno.split("-").reverse().join("/") : "")}">
          <input class="wide2" name="bio" placeholder="Descrizione goliardica" value="${esc(p.bio || "")}">
          <label class="ex-check"><input type="checkbox" name="ex"${p.ex ? " checked" : ""}> 🏛️ Gloria del passato (non più in rosa)</label>
        </div>
        <div class="tools">
          <label class="btn sm ghost" style="margin:0;text-transform:none;letter-spacing:0">📷 Foto<input type="file" accept="image/*" hidden data-photo></label>
          ${p.foto ? `<button class="btn sm ghost" data-nophoto>Togli foto</button>` : ""}
          <button class="btn sm danger" data-rmp>Elimina</button>
        </div>
      </div>
    </div>`;
  }
  const collect = () =>
    $$("#rosa-list .player-edit").map((d) => ({
      id: d.dataset.id,
      numero: $("[name=numero]", d).value === "" ? "" : Number($("[name=numero]", d).value),
      nome: $("[name=nome]", d).value.trim(),
      soprannome: $("[name=soprannome]", d).value.trim(),
      ruolo: $("[name=ruolo]", d).value,
      bio: $("[name=bio]", d).value.trim(),
      alias: $("[name=alias]", d).value.trim(),
      compleanno: (() => { const m = $("[name=compleanno]", d).value.trim().match(/^(\d{1,2})[\/.\-](\d{1,2})/); return m ? `${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; })(),
      foto: d.dataset.foto || "",
      ...($("[name=ex]", d).checked ? { ex: true } : {}),
    })).filter((p) => p.nome);
  const bind = () => {
    $$("[name=ex]", el).forEach((c) => (c.onchange = () => c.closest(".player-edit").classList.toggle("is-ex", c.checked)));
    $$("[data-rmp]", el).forEach((b) => (b.onclick = () => confirm("Eliminare il giocatore?") && b.closest(".player-edit").remove()));
    $$("[data-nophoto]", el).forEach((b) => (b.onclick = () => { const d = b.closest(".player-edit"); d.dataset.foto = ""; $(".avatar", d).textContent = "—"; b.remove(); }));
    $$("[data-photo]", el).forEach((inp) => (inp.onchange = async () => {
      const f = inp.files[0];
      if (!f) return;
      const d = inp.closest(".player-edit");
      toast("Carico la foto…");
      try {
        const { url } = await uploadImage(f);
        d.dataset.foto = url;
        $(".avatar", d).innerHTML = `<img src="${esc(url)}" alt="">`;
        toast("Foto caricata: ricordati di salvare");
      } catch (e) { toast(e.message, true); }
    }));
  };
  bind();
  $("#rosa-add").addEventListener("click", () => {
    $("#rosa-list").insertAdjacentHTML("beforeend", playerHTML({ id: uid("p"), ruolo: "" }));
    bind();
  });
  $("#rosa-save").addEventListener("click", async () => {
    DATA.rosa = collect();
    if (await save("rosa", "Rosa salvata")) renderTabs();
  });
}

// ---------- FOTO ----------
function tabFoto(el) {
  const foto = DATA.foto || [];
  el.innerHTML = `<div class="card">
    <h3>Carica foto</h3>
    <div class="help">Puoi selezionarne più di una. Le foto vengono ridimensionate automaticamente prima del caricamento.</div>
    <div class="row">
      <div><label for="f-files">Foto</label><input type="file" id="f-files" accept="image/*" multiple></div>
      <div><label for="f-cap">Didascalia (per tutte)</label><input id="f-cap" placeholder="Terzo tempo dopo la manita"></div>
    </div>
    <div class="actions"><button class="btn lime" id="f-up">Carica</button><span id="f-status" class="small"></span></div>
  </div>
  <div class="card section">
    <h3>Foto pubblicate (${foto.length})</h3>
    ${foto.length ? `<div class="admin-gallery">${[...foto].reverse().map((f) => `<div class="item" data-key="${esc(f.key)}">
      <img src="${esc(f.url)}" alt="" loading="lazy">
      <div><input data-cap value="${esc(f.didascalia || "")}" placeholder="Didascalia"><button class="btn sm danger" data-rmf>Elimina</button></div>
    </div>`).join("")}</div>
    <div class="actions"><button class="btn" id="f-savecap">Salva didascalie</button></div>` : `<p class="empty">Nessuna foto.</p>`}
  </div>`;
  $("#f-up").addEventListener("click", async () => {
    const files = [...$("#f-files").files];
    if (!files.length) return toast("Scegli almeno una foto", true);
    const cap = $("#f-cap").value.trim();
    const btn = $("#f-up");
    btn.disabled = true;
    DATA.foto = DATA.foto || [];
    try {
      for (let i = 0; i < files.length; i++) {
        $("#f-status").textContent = `Caricamento ${i + 1} di ${files.length}…`;
        const { key, url } = await uploadImage(files[i]);
        DATA.foto.push({ key, url, didascalia: cap, data: new Date().toISOString().slice(0, 10) });
      }
      if (await save("foto", `${files.length} foto pubblicate`)) renderTabs();
    } catch (e) {
      toast(e.message, true);
    } finally {
      btn.disabled = false;
    }
  });
  $("#f-savecap")?.addEventListener("click", async () => {
    $$(".admin-gallery .item", el).forEach((it) => {
      const f = DATA.foto.find((x) => x.key === it.dataset.key);
      if (f) f.didascalia = $("[data-cap]", it).value.trim();
    });
    await save("foto", "Didascalie salvate");
  });
  $$("[data-rmf]", el).forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Eliminare la foto?")) return;
    const key = b.closest(".item").dataset.key;
    if (!key.startsWith("static-")) { try { await api(`/api/upload?key=${encodeURIComponent(key)}`, { method: "DELETE" }); } catch {} }
    DATA.foto = DATA.foto.filter((x) => x.key !== key);
    if (await save("foto", "Foto eliminata")) renderTabs();
  }));
}

// ---------- SOCIETÀ E LINK ----------
function tabSocieta(el) {
  const s = DATA.societa || {};
  el.innerHTML = `<div class="card">
    <h3>La Società</h3>
    <label for="s-intro">Storia e presentazione</label>
    <textarea id="s-intro">${esc(s.intro || "")}</textarea>
    <label for="s-org">Organigramma (una riga per carica: Ruolo | Nome | Nota)</label>
    <textarea id="s-org" style="min-height:140px" placeholder="Presidente onorario | Il Barman | Firma i contratti sui sottobicchieri">${esc((s.organigramma || []).map((o) => [o.ruolo, o.nome, o.nota].filter(Boolean).join(" | ")).join("\n"))}</textarea>
    <label for="s-val">I nostri valori</label>
    <textarea id="s-val" style="min-height:100px">${esc(s.valori || "")}</textarea>
    <div class="actions"><button class="btn lime" id="s-save">Salva società</button></div>
  </div>
  <div class="card section">
    <h3>Link esterni</h3>
    <div class="help">Una riga per link: <code>Titolo | https://indirizzo</code>. Compaiono in Home e nella pagina della Società.</div>
    <textarea id="l-text" style="min-height:120px">${esc((DATA.link || []).map((l) => `${l.titolo} | ${l.url}`).join("\n"))}</textarea>
    <div class="actions"><button class="btn lime" id="l-save">Salva link</button></div>
  </div>`;
  $("#s-save").addEventListener("click", async () => {
    DATA.societa = {
      intro: $("#s-intro").value.trim(),
      valori: $("#s-val").value.trim(),
      organigramma: $("#s-org").value.split(/\r?\n/).map((l) => l.split("|").map((x) => x.trim())).filter((f) => f[0])
        .map(([ruolo, nome = "", nota = ""]) => ({ ruolo, nome, nota })),
    };
    await save("societa", "Società salvata");
  });
  $("#l-save").addEventListener("click", async () => {
    DATA.link = $("#l-text").value.split(/\r?\n/).map((l) => l.split("|").map((x) => x.trim())).filter((f) => f[0] && /^https?:\/\//i.test(f[1] || ""))
      .map(([titolo, url]) => ({ titolo, url }));
    await save("link", "Link salvati");
  });
}

// ---------- IMPOSTAZIONI ----------
function tabImpostazioni(el) {
  const q = DATA.squadra || {};
  const f = (k, label, ph = "") => `<div><label for="q-${k}">${label}</label><input id="q-${k}" value="${esc(q[k] || "")}" placeholder="${esc(ph)}"></div>`;
  el.innerHTML = `<div class="card">
    <h3>Dati della squadra</h3>
    <div class="row">${f("nome", "Nome squadra")}${f("motto", "Motto")}</div>
    <div class="row">${f("campionato", "Campionato")}${f("campo", "Campo di gioco")}</div>
    <div class="row">${f("fondazione", "Anno di fondazione")}${f("nomeUfficiale", "Nome della squadra sul sito del campionato", "GIN TONICI FC")}</div>
    ${f("linkCampionato", "Link al calendario su areasport.org", "https://www.areasport.org/calendario/…")}
    <label>Foto di squadra (Home e pagina Squadra)</label>
    <div class="actions" style="margin-top:0">
      ${q.fotoSquadra ? `<img src="${esc(q.fotoSquadra)}" alt="" style="height:70px;border-radius:8px">` : ""}
      <label class="btn sm ghost" style="margin:0;text-transform:none;letter-spacing:0">📷 Cambia foto<input type="file" accept="image/*" hidden id="q-team"></label>
    </div>
    <p class="small">Il link serve all'aggiornamento automatico: se l'anno prossimo cambia campionato, basta incollare qui il nuovo link al calendario.</p>
    <div class="actions"><button class="btn lime" id="q-save">Salva</button></div>
  </div>
  <div class="section">${syncBox()}</div>
  <div class="card section">
    <h3>Esci</h3>
    <button class="btn ghost" id="q-logout">Esci dall'area Admin</button>
  </div>`;
  $("#q-save").addEventListener("click", async () => {
    for (const k of ["nome", "motto", "campionato", "campo", "fondazione", "nomeUfficiale", "linkCampionato"]) q[k] = $(`#q-${k}`).value.trim();
    DATA.squadra = q;
    await save("squadra", "Dati squadra salvati");
  });
  bindSync(el);
  $("#q-team").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      toast("Carico la foto…");
      q.fotoSquadra = (await uploadImage(f)).url;
      DATA.squadra = q;
      if (await save("squadra", "Foto di squadra aggiornata")) renderTabs();
    } catch (err) { toast(err.message, true); }
  });
  $("#q-logout").addEventListener("click", () => {
    try { sessionStorage.removeItem("gt-pwd"); } catch {}
    location.reload();
  });
}
