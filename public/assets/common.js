// Funzioni condivise tra sito pubblico e Admin.

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export async function loadData() {
  try {
    const r = await fetch("/api/data", { cache: "no-store" });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch {
    // Anteprima locale senza Netlify: usa i dati di esempio
    const r = await fetch("/data/seed.json");
    return await r.json();
  }
}

const DAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const MONTHS_LONG = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const DAYS_LONG = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

export function parseISODate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
export function fmtDate(s, long = false) {
  const d = parseISODate(s);
  if (!d) return "da definire";
  return long
    ? `${DAYS_LONG[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]}`
    : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export const isPlayed = (p) => p.gf !== null && p.gf !== undefined && p.gf !== "" && p.gs !== null && p.gs !== undefined && p.gs !== "";

export function esito(p) {
  if (!isPlayed(p)) return null;
  const gf = Number(p.gf), gs = Number(p.gs);
  return gf > gs ? "V" : gf < gs ? "P" : "N";
}

export function sortedMatches(data) {
  return [...(data.partite || [])].sort((a, b) => (a.data || "9999").localeCompare(b.data || "9999") || (a.giornata || 0) - (b.giornata || 0));
}
export function lastMatch(data) {
  return sortedMatches(data).filter(isPlayed).pop() || null;
}
export function nextMatch(data) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return sortedMatches(data).find((p) => !isPlayed(p) && (!p.data || parseISODate(p.data) >= today)) || null;
}

export const isUs = (name, data) => {
  const n = String(name || "").toLowerCase();
  const ours = String(data?.squadra?.nome || "gin tonici").toLowerCase().replace(/f\.?c\.?/g, "").trim();
  return n.includes("gin tonic") || (ours && n.includes(ours));
};

// "Conti 2, Rossi, Ferri (2), Bianchi x2" -> [{nome, gol}]
export function parseScorers(str) {
  return String(str || "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const m = s.match(/^(.*?)[\s(]*x?\s*(\d+)\s*\)?$/i);
      if (m && m[1].trim()) return { nome: m[1].trim(), gol: Number(m[2]) };
      return { nome: s, gol: 1 };
    });
}

export function scorersTable(data) {
  // Se ci sono i marcatori ufficiali del campionato, valgono quelli
  if (data.marcatoriUfficiali?.length) {
    return [...data.marcatoriUfficiali].sort((a, b) => b.gol - a.gol || a.nome.localeCompare(b.nome));
  }
  const tot = new Map();
  for (const p of data.partite || []) {
    for (const s of parseScorers(p.marcatori)) {
      const key = s.nome.toLowerCase();
      const cur = tot.get(key) || { nome: s.nome, gol: 0 };
      cur.gol += s.gol;
      tot.set(key, cur);
    }
  }
  return [...tot.values()].sort((a, b) => b.gol - a.gol || a.nome.localeCompare(b.nome));
}

// Giocatore della rosa che corrisponde a un nome scritto in pagella/marcatori
const toks = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9']+/).filter(Boolean);
const nicks = (p) => [p.soprannome, ...String(p.alias || "").split(/[,;/]/)].map((x) => toks(x).join(" ")).filter(Boolean);

// Giocatore della rosa che corrisponde a un nome scritto in pagelle o marcatori.
// Priorità: soprannome/altri nomi > nome completo (in qualsiasi ordine) > solo cognome o nome.
export function matchPlayer(name, rosa) {
  const n = toks(String(name || "").replace(/\([^)]*\)/g, " "));
  if (!n.length) return null;
  const key = n.join(" ");
  const list = rosa || [];
  const sameSet = (a, b) => a.length === b.length && a.every((t) => b.includes(t));
  return (
    list.find((p) => nicks(p).includes(key)) ||
    list.find((p) => sameSet(n, toks(p.nome))) ||
    list.find((p) => n.length > 1 && n.every((t) => toks(p.nome).includes(t))) ||
    list.find((p) => n.length === 1 && toks(p.nome).includes(n[0])) ||
    null
  );
}

const MESI_BREVI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
export function fmtCompleanno(mmdd) {
  const m = String(mmdd || "").match(/^(\d{2})-(\d{2})$/);
  return m ? `${Number(m[2])} ${MESI_BREVI[Number(m[1]) - 1]}` : "";
}
// Prossimi compleanni entro "days" giorni: [{player, days}]
export function nextBirthdays(rosa, days = 30) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return (rosa || []).filter((p) => /^\d{2}-\d{2}$/.test(p.compleanno || "")).map((p) => {
    const [m, d] = p.compleanno.split("-").map(Number);
    let next = new Date(today.getFullYear(), m - 1, d);
    if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
    return { player: p, days: Math.round((next - today) / 86400000) };
  }).filter((x) => x.days <= days).sort((a, b) => a.days - b.days);
}

export function sortedStandings(data) {
  return [...(data.classifica || [])].sort(
    (a, b) => (b.pt ?? 0) - (a.pt ?? 0) || ((b.gf ?? 0) - (b.gs ?? 0)) - ((a.gf ?? 0) - (a.gs ?? 0)) || (b.gf ?? 0) - (a.gf ?? 0)
  );
}

export function votoClass(v) {
  if (v === null || v === undefined || isNaN(v)) return "sv";
  if (v >= 7) return "top";
  if (v >= 6) return "ok";
  return "ko";
}

// ---------- PARSER PAGELLE ----------
// Accetta righe tipo:
//   Conti 9 - Tripletta, paga da bere
//   - Rossi: 7,5 gol e assist
//   Neri 6½ sicuro
//   Bianchi sv (entrato a 2 dalla fine)
//   MVP: Conti      /  Flop: Costa
//   Titolo: Manita a domicilio
// Le righe senza voto prima del primo voto diventano l'introduzione;
// quelle dopo vengono aggiunte al commento del giocatore precedente.
const VOTO_RE =
  /^(?:[-*•·>\s]|\d+[.)]\s)*(.+?)\s*[:\-–—|,]?\s+(\d{1,2}(?:[.,]\d{1,2})?(?:½|\+\+|--|\+|-)?|s\.?\s?v\.?|n\.?\s?g\.?)(?=\s|$|[:\-–—|,.;!])\s*[:\-–—|,.;]*\s*(.*)$/i;

export function parseVoto(raw) {
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, "");
  if (/^(s\.?v\.?|n\.?g\.?)$/.test(s)) return { voto: "s.v.", valore: null };
  const m = s.match(/^(\d{1,2}(?:[.,]\d{1,2})?)(½|\+\+|--|\+|-)?$/);
  if (!m) return null;
  let v = parseFloat(m[1].replace(",", "."));
  const mod = m[2] || "";
  if (mod === "½") v += 0.5;
  if (mod === "+") v += 0.25;
  if (mod === "-") v -= 0.25;
  if (mod === "++") v += 0.5;
  if (mod === "--") v -= 0.5;
  if (v < 0 || v > 10) return null;
  let label = m[1].replace(".", ",");
  if (mod === "½") label = `${m[1]}½`;
  else label += mod;
  return { voto: label, valore: v };
}

// Stile "spogliatoio": NOME: [voto] testo lungo... ETICHETTA FINALE IN MAIUSCOLO
// Il nome deve iniziare in MAIUSCOLO (es. "GIONANA:", "ALE V 6,5:", "GIOSI (spero si scriva così):")
const BLOCK_RE = /^([A-ZÀ-ÖØ-Þ0-9][A-ZÀ-ÖØ-Þ0-9’'.\-\/& ]*(?:\([^)]{0,40}\))?[A-ZÀ-ÖØ-Þ0-9’'.\-\/& ]*?)\s*:\s*(.*)$/;
const LEAD_VOTO_RE = /^(\d{1,2}(?:[.,]\d{1,2})?(?:½|\+\+|--|\+|-)?|s\.?\s?v\.?|n\.?\s?g\.?)(?=[\s:\-–—|,.;]|$)\s*[:\-–—|,.;]*\s*/i;
const TRAIL_VOTO_RE = /\s+(\d{1,2}(?:[.,]\d{1,2})?(?:½|\+\+|--|\+|-)?|s\.?\s?v\.?)$/i;

// Separa l'etichetta finale tutta in maiuscolo ("... certo certo. MARMOTTA")
export function splitEtichetta(commento) {
  // "…arriverà…NADIO BATTOCLETTI": stacca l'etichetta attaccata ai puntini
  const fixed = String(commento || "").trim().replace(/(…|\.\.\.)(?=[A-ZÀ-Þ][^a-zà-ÿ]*$)/, "$1 ");
  const toks = fixed.split(/\s+/);
  let i = toks.length;
  while (i > 0) {
    const t = toks[i - 1];
    const letters = t.replace(/[^A-Za-zÀ-ÿ]/g, "");
    if (/[a-zà-ÿ]/.test(letters)) break; // contiene minuscole
    if (!letters && !/^[–—\-&]$/.test(t)) break;
    i--;
  }
  const tag = toks.slice(i).join(" ").replace(/^[–—\-\s]+/, "").trim();
  const rest = toks.slice(0, i).join(" ").trim();
  if (tag.replace(/[^A-ZÀ-Þ]/g, "").length < 3 || !rest) return { commento: String(commento || "").trim(), etichetta: "" };
  return { commento: rest, etichetta: tag };
}

export function parsePagelle(text) {
  const out = { titolo: "", intro: "", voti: [], mvp: "", flop: "" };
  const intro = [];
  const push = (nome, v, commento) => out.voti.push({ nome, voto: v ? v.voto : "–", valore: v ? v.valore : null, commento: (commento || "").trim() });
  for (let line of String(text || "").split(/\r?\n/)) {
    line = line.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^titolo\s*[:\-–]\s*(.+)$/i))) { out.titolo = m[1].trim(); continue; }
    if ((m = line.match(/^(mvp|migliore|lime d'oro|gin tonic d'oro)\s*[:\-–]\s*(.+)$/i))) { out.mvp = m[2].trim(); continue; }
    if ((m = line.match(/^(flop|peggiore|bidone|tonica sgasata)\s*[:\-–]\s*(.+)$/i))) { out.flop = m[2].trim(); continue; }
    // 1) stile spogliatoio: NOME: testo
    m = line.match(BLOCK_RE);
    if (m && m[1].trim().length <= 45 && /[A-ZÀ-Þ]{2}/.test(m[1])) {
      let nome = m[1].trim();
      let body = m[2];
      let v = null;
      const tv = nome.match(TRAIL_VOTO_RE);
      if (tv) { v = parseVoto(tv[1]); nome = nome.slice(0, tv.index).trim(); }
      const lv = !v && body.match(LEAD_VOTO_RE);
      if (lv) { v = parseVoto(lv[1]); body = body.slice(lv[0].length); }
      push(nome, v, body);
      continue;
    }
    // 2) stile classico: Nome 6,5 - commento
    m = line.match(VOTO_RE);
    if (m) {
      const nome = m[1].replace(/[:\-–—|,]+$/, "").trim();
      const v = parseVoto(m[2]);
      if (v && nome && nome.length <= 40 && !/^\d+$/.test(nome)) {
        push(nome, v, m[3]);
        continue;
      }
    }
    if (out.voti.length) {
      const last = out.voti[out.voti.length - 1];
      last.commento = (last.commento ? last.commento + "\n" : "") + line;
    } else intro.push(line);
  }
  for (const v of out.voti) Object.assign(v, splitEtichetta(v.commento));
  out.intro = intro.join("\n");
  const rated = out.voti.filter((v) => v.valore !== null);
  if (!out.mvp && rated.length) out.mvp = rated.reduce((a, b) => (b.valore > a.valore ? b : a)).nome;
  if (!out.flop && rated.length > 1) out.flop = rated.reduce((a, b) => (b.valore < a.valore ? b : a)).nome;
  return out;
}

// ---------- PARSER CLASSIFICA ----------
// Incolla la tabella copiata dal sito del campionato.
// order: elenco delle colonne numeriche nell'ordine in cui compaiono (la squadra è il testo).
export const DEFAULT_ORDER = "pos pt g v n p gf gs dr";

export function parseClassifica(text, order = DEFAULT_ORDER) {
  const cols = order.toLowerCase().split(/[\s,;]+/).filter(Boolean);
  const isNum = (t) => /^[+\-]?\d+[.°)]?$/.test(t);
  const rows = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const t = raw.trim().split(/\s+/).filter(Boolean);
    let i = 0;
    const lead = [];
    while (i < t.length && isNum(t[i])) lead.push(parseInt(t[i++], 10));
    const words = [];
    while (i < t.length && !isNum(t[i])) words.push(t[i++]);
    let tail = t.slice(i);
    if (!words.length) continue;
    const useCols = cols[0] === "pos" && lead.length === 0 ? cols.slice(1) : cols;
    // Numeri in eccesso subito dopo il nome fanno parte del nome (es. "Real 2000")
    while (lead.length + tail.filter(isNum).length > useCols.length && tail.length && isNum(tail[0])) words.push(tail.shift());
    const rest = tail.filter(isNum).map((x) => parseInt(x, 10));
    if (rest.length < 2) continue;
    const nums = [...lead, ...rest];
    const r = { squadra: words.join(" ") };
    useCols.forEach((c, k) => { if (nums[k] !== undefined) r[c] = nums[k]; });
    rows.push(clean(r));
  }
  return rows;
}
function clean(r) {
  const o = { squadra: r.squadra };
  for (const k of ["pt", "g", "v", "n", "p", "gf", "gs"]) if (r[k] !== undefined) o[k] = r[k];
  if (o.gf === undefined && o.gs === undefined && r.dr !== undefined) o.dr = r.dr;
  return o;
}

export const uid = (p = "x") => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
