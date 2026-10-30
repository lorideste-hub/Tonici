// Lettura automatica di calendario, classifica e marcatori dal sito areasport.org
// Funziona sia nelle functions Netlify sia in Node (per i test).

const MESI = { gennaio: 1, febbraio: 2, marzo: 3, aprile: 4, maggio: 5, giugno: 6, luglio: 7, agosto: 8, settembre: 9, ottobre: 10, novembre: 11, dicembre: 12 };

const decode = (s) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const text = (html) => decode(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// Restituisce le righe di tutte le tabelle: [{ th: bool, cells: [testo] , html: [html] }]
function rows(html) {
  const out = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trRe.exec(html))) {
    const cells = [];
    const raw = [];
    const cRe = /<(td|th)\b[^>]*>([\s\S]*?)<\/\1>/gi;
    let c, th = false;
    while ((c = cRe.exec(m[1]))) {
      if (c[1].toLowerCase() === "th") th = true;
      cells.push(text(c[2]));
      raw.push(c[2]);
    }
    if (cells.length) out.push({ th, cells, raw });
  }
  return out;
}

// "Gin Tonici FC" -> confronto tollerante
export const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const sameTeam = (a, b) => {
  const x = norm(a), y = norm(b);
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
};

// URL del calendario -> URL di classifica e marcatori
export function urlsFrom(calendarUrl) {
  const u = new URL(calendarUrl);
  const m = u.pathname.match(/\/(calendario|classifica|marcatori)\/(\d+)\/(\d+)/);
  if (!m) throw new Error("Link del campionato non riconosciuto (atteso .../calendario/NNN/NN)");
  const base = `${u.origin}`;
  return {
    calendario: `${base}/calendario/${m[2]}/${m[3]}`,
    classifica: `${base}/classifica/${m[2]}/${m[3]}`,
    marcatori: `${base}/marcatori/${m[2]}/${m[3]}`,
  };
}

function parseDateTime(s) {
  // "28 settembre 2026 - 21:55"
  const m = String(s).toLowerCase().match(/(\d{1,2})\s+([a-zà]+)\s+(\d{4})(?:\s*-\s*(\d{1,2})[:.](\d{2}))?/);
  if (!m || !MESI[m[2]]) return { data: "", ora: "" };
  const data = `${m[3]}-${String(MESI[m[2]]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const ora = m[4] ? `${m[4].padStart(2, "0")}:${m[5]}` : "";
  return { data, ora };
}

// Tutte le partite della squadra indicata
export function parseCalendario(html, team) {
  const out = [];
  let giornata = null;
  for (const r of rows(html)) {
    const g = r.cells.length === 1 && r.cells[0].match(/giornata\s*(\d+)/i);
    if (g) { giornata = Number(g[1]); continue; }
    if (r.th || r.cells.length < 4) continue;
    const [dt, casa, ris, ospite, campo = ""] = r.cells;
    const isCasa = sameTeam(casa, team);
    const isOspite = sameTeam(ospite, team);
    if (!isCasa && !isOspite) continue;
    const { data, ora } = parseDateTime(dt);
    const sm = ris.match(/(\d+)\s*-\s*(\d+)/);
    const gc = sm ? Number(sm[1]) : null;
    const go = sm ? Number(sm[2]) : null;
    const partita = (r.raw[2] || "").match(/\/partita\/(\d+)/);
    out.push({
      giornata,
      data,
      ora,
      avversario: isCasa ? ospite : casa,
      casa: isCasa,
      gf: sm ? (isCasa ? gc : go) : null,
      gs: sm ? (isCasa ? go : gc) : null,
      campo,
      extId: partita ? partita[1] : "",
    });
  }
  return out;
}

export function parseClassifica(html) {
  const all = rows(html);
  const head = all.find((r) => r.th && r.cells.some((c) => /^squadra$/i.test(c)));
  const map = { "pos": "pos", "squadra": "squadra", "p.ti": "pt", "pt": "pt", "punti": "pt", "g": "g", "v": "v", "n": "n", "p": "p", "gf": "gf", "gs": "gs", "dr": "dr" };
  const cols = head ? head.cells.map((c) => map[c.toLowerCase()] || null) : ["pos", "squadra", "pt", "g", "v", "n", "p", "gf", "gs", "dr"];
  const out = [];
  for (const r of all) {
    if (r.th || r.cells.length < 8) continue;
    const o = {};
    r.cells.forEach((c, i) => {
      const k = cols[i];
      if (!k) return;
      if (k === "squadra") o.squadra = c;
      else if (/^[+\-]?\d+$/.test(c)) o[k] = parseInt(c, 10);
    });
    if (o.squadra && o.pt !== undefined) {
      delete o.pos; delete o.dr;
      out.push(o);
    }
  }
  return out;
}

export function parseMarcatori(html, team) {
  const out = [];
  for (const r of rows(html)) {
    if (r.th || r.cells.length < 3) continue;
    const [nome, squadra, gol] = r.cells;
    if (!/^\d+$/.test(gol)) continue;
    if (team && !sameTeam(squadra, team)) continue;
    out.push({ nome, gol: Number(gol) });
  }
  return out;
}

async function get(url) {
  const r = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 (compatible; GinToniciFC-site/1.0)", "accept-language": "it-IT,it;q=0.9" },
  });
  if (!r.ok) throw new Error(`${url} ha risposto ${r.status}`);
  return r.text();
}

// Aggiorna l'oggetto dati del sito. Le partite esistenti vengono riconosciute
// per giornata+avversario, così pagelle e marcatori inseriti a mano restano collegati.
export async function syncFromAreaSport(data) {
  const link = data.squadra?.linkCampionato;
  if (!link) throw new Error("Inserisci prima il link del calendario in Impostazioni");
  const team = data.squadra?.nomeUfficiale || "GIN TONICI";
  const u = urlsFrom(link);
  const [cal, cla, mar] = await Promise.all([get(u.calendario), get(u.classifica), get(u.marcatori)]);

  const partite = parseCalendario(cal, team);
  const classifica = parseClassifica(cla);
  const marcatori = parseMarcatori(mar, team);
  if (!partite.length) throw new Error(`Nessuna partita trovata per "${team}" nel calendario`);

  const old = data.partite || [];
  const used = new Set();
  data.partite = partite.map((p) => {
    const prev =
      old.find((o) => !used.has(o.id) && p.extId && o.extId === p.extId) ||
      old.find((o) => !used.has(o.id) && o.giornata === p.giornata && sameTeam(o.avversario, p.avversario)) ||
      null;
    if (prev) used.add(prev.id);
    return {
      id: prev?.id || `as${p.extId || `${p.giornata}-${norm(p.avversario)}`}`,
      ...p,
      marcatori: prev?.marcatori || "",
    };
  });
  if (classifica.length) {
    data.classifica = classifica;
    data.classificaAggiornata = new Date().toISOString();
  }
  data.marcatoriUfficiali = marcatori;
  data.ultimoSync = new Date().toISOString();
  return { partite: data.partite.length, squadre: classifica.length, marcatori: marcatori.length };
}
