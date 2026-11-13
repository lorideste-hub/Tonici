// Simula partita: campo visto dall'alto in stile "Scudetto" (manageriale anni 2000).
// Le pedine sono i giocatori della Formazione (con cambi dalla panchina), la palla gira tra loro
// e una cronaca goliardica racconta le azioni principali fino al risultato finale.
//
// Il pronostico è FISSO per partita: il punteggio dipende solo dall'id della partita e dai numeri
// di classifica/risultati (gol fatti e subiti, forma recente). Chi segna e chi sbaglia dipende
// invece dalla formazione, dai gol stagionali e dalla media voto delle pagelle.

import { esc, fmtDate, matchPlayer, isUs, scorersTable, isAttivo } from "./common.js";
import { formazioneFor, slots, presenzeMap, shortName, DEFAULT_MODULO } from "./formazione.js";

const TEMPO = 25;        // minuti per tempo (calciotto)
const MAX_SEC = 115;     // durata massima della simulazione alla velocità base (secondi reali)
const BASE_SPEED = 1.5;  // le azioni partono già velocizzate
const FAST_SPEED = 2;

// ---------------- numeri casuali ripetibili ----------------

function seedOf(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
function rng(str) {
  let a = seedOf(str);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function poisson(l, R) {
  const L = Math.exp(-l);
  let k = 0, p = 1;
  do { k++; p *= R(); } while (p > L && k < 30);
  return k - 1;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr, R) => arr[Math.floor(R() * arr.length)];
function pickW(items, weight, R) {
  const tot = items.reduce((s, x) => s + Math.max(0, weight(x)), 0);
  if (!tot) return items[0];
  let r = R() * tot;
  for (const x of items) { r -= Math.max(0, weight(x)); if (r <= 0) return x; }
  return items[items.length - 1];
}
const dot = (t) => (/[.!?]$/.test(t) ? t : `${t}.`);
const fill = (tpl, v) => tpl.replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ""));

// ---------------- forza delle squadre ----------------

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
const played = (r) => r.gc !== null && r.gc !== undefined && r.gc !== "" && r.go !== null && r.go !== undefined && r.go !== "";

function findRow(data, name) {
  const rows = data.classifica || [];
  if (name === null) return rows.find((r) => isUs(r.squadra, data)) || null;
  const n = norm(name);
  return rows.find((r) => norm(r.squadra) === n) || rows.find((r) => n && (norm(r.squadra).includes(n) || n.includes(norm(r.squadra)))) || null;
}

// Ultime 3 partite giocate dalla squadra, dai risultati di tutto il campionato
function recentForm(data, isTeam) {
  const list = (data.risultati || [])
    .filter((r) => played(r) && (isTeam(r.casa) || isTeam(r.ospite)))
    .sort((a, b) => (b.giornata || 0) - (a.giornata || 0) || String(b.data || "").localeCompare(String(a.data || "")))
    .slice(0, 3);
  if (!list.length) return null;
  let gf = 0, gs = 0;
  for (const r of list) {
    const home = isTeam(r.casa);
    gf += Number(home ? r.gc : r.go);
    gs += Number(home ? r.go : r.gc);
  }
  return { gf: gf / list.length, gs: gs / list.length, n: list.length };
}

function forza(data, match) {
  let G = 0, GF = 0;
  for (const r of data.classifica || []) if (Number(r.g)) { G += Number(r.g); GF += Number(r.gf || 0); }
  const avg = G ? GF / G : 4; // gol segnati da una squadra in una partita, media del campionato
  const one = (row, form) => {
    const g = Number(row?.g || 0);
    let att = g ? Number(row.gf || 0) / g / avg : 1;
    let def = g ? Number(row.gs || 0) / g / avg : 1;
    const w = g / (g + 3); // con poche partite si resta vicini alla media
    att = 1 + (att - 1) * w;
    def = 1 + (def - 1) * w;
    if (form) { att = att * 0.75 + (form.gf / avg) * 0.25; def = def * 0.75 + (form.gs / avg) * 0.25; }
    return { att, def, row, form };
  };
  const opp = norm(match.avversario);
  const us = one(findRow(data, null), recentForm(data, (n) => isUs(n, data)));
  const them = one(findRow(data, match.avversario), recentForm(data, (n) => norm(n) === opp));
  return {
    avg, us, them,
    lUs: clamp(avg * us.att * them.def, 0.6, 9),
    lThem: clamp(avg * them.att * us.def, 0.6, 9),
  };
}

// ---------------- giocatori ----------------

function playerInfo(data) {
  const goals = new Map();
  for (const s of scorersTable(data)) {
    const pl = matchPlayer(s.nome, data.rosa);
    if (pl) goals.set(pl.id, (goals.get(pl.id) || 0) + s.gol);
  }
  const votes = new Map();
  for (const pg of data.pagelle || []) for (const v of pg.voti || []) {
    if (v.valore === null || v.valore === undefined) continue;
    const pl = matchPlayer(v.nome, data.rosa);
    if (!pl) continue;
    const c = votes.get(pl.id) || [0, 0];
    c[0] += v.valore; c[1]++;
    votes.set(pl.id, c);
  }
  const pres = presenzeMap(data);
  return (id) => ({
    goals: goals.get(id) || 0,
    pres: pres.get(id) || 0,
    voto: votes.has(id) ? votes.get(id)[0] / votes.get(id)[1] : null,
  });
}

const ROLE_W = { por: 0.03, dif: 0.7, cen: 1.3, att: 2.3 };
function shotWeight(slot, info) {
  if (!slot.player) return ROLE_W[slot.role] * 0.6;
  const i = info(slot.player.id);
  const gpp = i.goals / Math.max(1, i.pres || 1);
  const v = i.voto === null ? 1 : clamp(0.7 + (i.voto - 5) * 0.2, 0.6, 1.4);
  return ROLE_W[slot.role] * (1 + gpp * 0.8) * v;
}

const nameOf = (p) => (p ? shortName(p) : "l'imbucato");
const shirt = (p) => (p?.numero !== "" && p?.numero != null ? String(p.numero) : nameOf(p).slice(0, 1).toUpperCase());

function lineup(data, match, info) {
  const f = formazioneFor(data, match.id);
  const modulo = f?.modulo || DEFAULT_MODULO;
  const pos = slots(modulo);
  const byId = new Map((data.rosa || []).map((p) => [p.id, p]));
  const used = new Set();
  const picks = pos.map((s, i) => {
    const p = byId.get(f?.titolari?.[i]);
    if (p && !used.has(p.id)) { used.add(p.id); return p; }
    return null;
  });
  const auto = picks.some((p) => !p);
  const pool = () => (data.rosa || [])
    .filter((p) => isAttivo(p) && !used.has(p.id))
    .sort((a, b) => info(b.id).pres - info(a.id).pres || info(b.id).goals - info(a.id).goals || a.nome.localeCompare(b.nome));
  const take = (p) => { if (p) used.add(p.id); return p || null; };
  if (!picks[0]) {
    const pl = pool();
    picks[0] = take(pl.find((p) => p.ruolo === "Portiere") || pl.find((p) => info(p.id).goals === 0) || pl[0]);
  }
  // attaccanti mancanti: chi segna di più; gli altri posti: chi ha più presenze
  pos.forEach((s, i) => {
    if (picks[i] || s.reparto.key !== "att") return;
    picks[i] = take([...pool()].sort((a, b) => info(b.id).goals - info(a.id).goals)[0]);
  });
  pos.forEach((s, i) => { if (!picks[i]) picks[i] = take(pool()[0]); });

  let bench = f ? (f.panchina || []).filter((id) => !used.has(id)).map((id) => byId.get(id)).filter(Boolean) : [];
  if (!f || !bench.length) bench = pool().slice(0, auto ? 3 : 0);
  return {
    modulo, auto,
    slots: pos.map((s, i) => ({ role: s.reparto.key, x: s.x, y: s.y, player: picks[i] })),
    bench,
  };
}

// ---------------- copione della partita ----------------

const T_GOAL = {
  manovra: [
    "GOOOL! Tiki-taka da aperitivo: {B} per {A}, {A} serve {S} che deve solo spingerla dentro.",
    "GOOOL! Azione corale, sembra il Barça dopo il terzo spritz: {S} chiude il triangolo con {A}.",
    "GOOOL! Uno-due {A}–{S} al limite, {S} piazza dove il portiere non arriva nemmeno col pensiero.",
    "GOOOL! {B} apre, {A} crossa basso, {S} in scivolata: pantaloncini verdi d'erba ma palla in rete.",
  ],
  contropiede: [
    "GOOOL! Ripartenza fulminante: lancio lungo per {S}, che brucia la difesa e la mette all'angolino.",
    "GOOOL! Contropiede da manuale (di chi, non si sa): {S} parte in campo aperto e non perdona.",
    "GOOOL! Palla recuperata, campo aperto e {S} che corre come se il bar chiudesse tra due minuti.",
  ],
  fuori: [
    "GOOOL! {S} prende la mira da lontanissimo… BOLIDE! Il portiere vede solo il ghiaccio che si scioglie.",
    "GOOOL! Botta da fuori di {S}: palla sotto l'incrocio, applausi anche dal bar.",
  ],
  corner: [
    "GOOOL! Angolo di {B}, {S} svetta di testa più in alto del prezzo di un gin tonic in centro.",
    "GOOOL! Mischia sul corner, {S} la spinge dentro di testa (o di spalla, la VAR non c'è).",
  ],
  solitaria: [
    "GOOOL! {S} parte palla al piede, salta due avversari e mezzo arbitro: rete da cineteca!",
    "GOOOL! Serpentina di {S} che manda al bar mezza difesa avversaria e insacca.",
  ],
  rigore: [
    "GOOOL! Rigore trasformato da {S}: spiazza il portiere e mima lo shaker.",
    "GOOOL! {S} dal dischetto con la freddezza di un cubetto di ghiaccio.",
  ],
};
const T_MISS = {
  parata: ["{S} ci prova, ma il portiere di {opp} dice di no.", "Conclusione di {S}: il portiere blocca in due tempi, con stile discutibile."],
  palo: ["PALO di {S}! Il legno trema come i tifosi in tribuna.", "{S} centra il palo pieno. Mira da rivedere, birra da offrire."],
  traversa: ["TRAVERSA di {S}! Il pallone sta ancora rimbalzando.", "{S} colpisce la traversa: un centimetro più sotto e si brindava."],
  fuori: ["{S} calcia… in tribuna. Qualcuno recuperi il pallone dal parcheggio.", "Tiro di {S} alto sopra la traversa: buono per la NBA."],
  rigore: ["Rigore per noi! {S} dal dischetto… PARATO! Stasera il primo giro lo paga lui."],
};
const T_GOAL_THEM = {
  base: [
    "Gol di {opp}: il n.{S} approfitta di una dormita di {V}.",
    "Rete di {opp}: {K} si tuffa con eleganza, purtroppo dalla parte sbagliata.",
    "Il n.{S} di {opp} infila {K}. Si va a riordinare la difesa (e il bancone).",
    "Doccia fredda: segna il n.{S}. {V} chiede il fuorigioco, ma anche no.",
  ],
  rigore: ["Rigore per {opp}: {V} entra come al bar a fine turno. Il n.{S} non sbaglia."],
  autogol: ["Autogol di {V}! Voleva spazzare, ha centrato la porta sbagliata: offre lui stasera."],
};
const T_MISS_THEM = {
  parata: ["Il n.{S} calcia, {K} para in tuffo: applausi e un lime in omaggio!", "Miracolo di {K} sul tiro del n.{S}!"],
  palo: ["Palo del n.{S}! {K} ringrazia il legno e fa finta di averla toccata."],
  traversa: ["Traversa di {opp}! {K} guarda in alto e si fa il segno della croce."],
  fuori: ["Il n.{S} spara alto. {V} lo guarda con sufficienza.", "Tiro di {opp} larghissimo: {K} non si sposta nemmeno."],
  rigore: ["Rigore per {opp}… {K} lo para! Statua in piazza Bra."],
};
const GAGS = [
  "{p} chiede all'arbitro quanto manca. Risposta: «Tutta la partita».",
  "Dalla tribuna parte il coro: «{motto}!»",
  "{p} perde una scarpa, ma non il sorriso.",
  "Il mister urla qualcosa dalla panchina. Nessuno capisce, tutti annuiscono.",
  "{p} prova il colpo di tacco: non riesce, ma lo stile c'è.",
  "{p} chiede il cambio per andare a ordinare. Respinto.",
  "Breve pausa: {p} si allaccia la scarpa, i compagni ne approfittano per respirare.",
];
const SUB_WHY = ["per rinfrescare la manovra", "crampi da aperitivo", "deve spostare la macchina", "scelta tecnica (e caratteriale)", "aveva promesso di tornare a casa presto"];

const GOAL_TYPES = [["manovra", 3], ["contropiede", 2], ["fuori", 1.5], ["corner", 1.2], ["solitaria", 1.2], ["rigore", 0.6]];
const MISS_TYPES = [["parata", 3], ["palo", 1.2], ["fuori", 2], ["traversa", 0.8], ["rigore", 0.3]];
const MISS_TPL = ["manovra", "contropiede", "fuori", "solitaria", "corner"];

function pickType(list, R) { return pickW(list, (x) => x[1], R)[0]; }

function copione(data, match) {
  const info = playerInfo(data);
  const F = forza(data, match);
  const R = rng(`score|${match.id}`);
  const gUs = Math.min(10, poisson(F.lUs, R));
  const gThem = Math.min(10, poisson(F.lThem, R));
  const C = rng(`cast|${match.id}`);
  // frasi senza ripetizioni finché il repertorio non è esaurito
  const usedTxt = new Set();
  const fresh = (arr) => {
    let left = arr.filter((x) => !usedTxt.has(x));
    if (!left.length) { arr.forEach((x) => usedTxt.delete(x)); left = arr; }
    const x = pick(left, C);
    usedTxt.add(x);
    return x;
  };
  const L = lineup(data, match, info);
  const opp = match.avversario || "Avversari";

  // numeri di maglia avversari
  const nums = Array.from({ length: 19 }, (_, i) => i + 2);
  for (let i = nums.length - 1; i > 0; i--) { const j = Math.floor(C() * (i + 1)); [nums[i], nums[j]] = [nums[j], nums[i]]; }
  const oppSlots = slots("3-3-1").map((s, i) => ({ role: s.reparto.key, x: s.x, y: s.y, num: i === 0 ? 1 : nums[i] }));

  // cambi
  const subs = [];
  const nSubs = Math.min(L.bench.length, 3, 1 + Math.floor(C() * 3));
  const outDone = new Set([0]);
  for (let k = 0; k < nSubs; k++) {
    const cand = L.slots.map((s, i) => ({ s, i })).filter(({ i }) => !outDone.has(i));
    if (!cand.length) break;
    const out = cand.sort((a, b) => shotWeight(a.s, info) - shotWeight(b.s, info))[Math.floor(C() * Math.min(3, cand.length))];
    outDone.add(out.i);
    subs.push({ min: k === 0 ? TEMPO : 30 + Math.floor(C() * 15), slot: out.i, player: L.bench[k], why: fresh(SUB_WHY) });
  }
  subs.sort((a, b) => a.min - b.min);
  const rosterAt = (min) => {
    const r = L.slots.map((s) => ({ ...s }));
    for (const s of subs) if (s.min <= min) r[s.slot] = { ...r[s.slot], player: s.player };
    return r;
  };

  // eventi: gol + occasioni sbagliate
  let mUs = 2 + Math.floor(C() * 3), mThem = 1 + Math.floor(C() * 3);
  while (gUs + gThem + mUs + mThem > 20 && (mUs > 1 || mThem > 1)) { if (mUs >= mThem && mUs > 1) mUs--; else mThem--; }
  const evs = [];
  for (let i = 0; i < gUs; i++) evs.push({ team: "us", goal: true });
  for (let i = 0; i < gThem; i++) evs.push({ team: "them", goal: true });
  for (let i = 0; i < mUs; i++) evs.push({ team: "us", goal: false });
  for (let i = 0; i < mThem; i++) evs.push({ team: "them", goal: false });
  for (let i = evs.length - 1; i > 0; i--) { const j = Math.floor(C() * (i + 1)); [evs[i], evs[j]] = [evs[j], evs[i]]; }
  const mins = new Set();
  while (mins.size < evs.length) mins.add(1 + Math.floor(C() * (2 * TEMPO - 1)));
  const sortedMins = [...mins].sort((a, b) => a - b);
  evs.forEach((e, i) => (e.min = sortedMins[i]));

  const outfield = (arr) => arr.map((s, i) => ({ s, i })).filter(({ i }) => i > 0);
  for (const e of evs) {
    const ours = rosterAt(e.min);
    if (e.team === "us") {
      e.kind = e.goal ? pickType(GOAL_TYPES, C) : pickType(MISS_TYPES, C);
      e.tpl = e.goal ? e.kind : e.kind === "rigore" ? "rigore" : pick(MISS_TPL, C);
      const sh = pickW(ours.map((s, i) => ({ s, i })), ({ s }) => shotWeight(s, info), C);
      const others = outfield(ours).filter(({ i }) => i !== sh.i);
      const as = pickW(others, ({ s }) => ({ dif: 1, cen: 2, att: 1.5 }[s.role] || 0.2), C);
      const third = pickW(others.filter(({ i }) => i !== as.i), ({ s }) => ({ dif: 1.5, cen: 1.5, att: 0.5 }[s.role] || 0.2), C) || as;
      Object.assign(e, { S: sh.i, A: as.i, B: third.i, V: 1 + Math.floor(C() * 3) });
      e.names = { S: nameOf(sh.s.player), A: nameOf(as.s.player), B: nameOf(third.s.player), opp };
      e.scorer = e.goal ? sh.s.player : null;
      e.assist = e.goal && ["manovra", "corner"].includes(e.kind) ? as.s.player : null;
      e.text = fill(fresh(e.goal ? T_GOAL[e.kind] : T_MISS[e.kind]), e.names);
    } else {
      e.kind = e.goal ? pickW(["base", "rigore", "autogol"], (k) => ({ base: 8, rigore: 0.8, autogol: 0.6 }[k]), C) : pickType(MISS_TYPES, C);
      e.tpl = e.kind === "rigore" ? "rigore" : e.kind === "autogol" ? "corner" : pick(MISS_TPL, C);
      const att = oppSlots.map((s, i) => ({ s, i })).filter(({ i }) => i > 0);
      const sh = pickW(att, ({ s }) => ROLE_W[s.role], C);
      const others = att.filter(({ i }) => i !== sh.i);
      const as = pick(others, C), third = pick(others.filter(({ i }) => i !== as.i), C);
      const ourDef = outfield(ours).filter(({ s }) => s.role !== "att");
      const v = pick(ourDef.length ? ourDef : outfield(ours), C);
      Object.assign(e, { S: sh.i, A: as.i, B: third.i, V: v.i });
      e.names = { S: sh.s.num, opp, V: nameOf(v.s.player), K: nameOf(ours[0].player) };
      e.victim = v.s.player;
      e.text = fill(fresh(e.goal ? T_GOAL_THEM[e.kind] : T_MISS_THEM[e.kind]), e.names);
    }
    e.lat = 30 + C() * 40; // fascia da cui arriva l'azione
    e.side = C() < 0.5 ? -1 : 1; // angolo dove va il pallone
  }

  // battute sparse
  const gagAt = new Set();
  const nG = Math.min(3, evs.length);
  while (gagAt.size < nG) gagAt.add(Math.floor(C() * evs.length));
  const motto = data.squadra?.motto || "Tanto ghiaccio, poca tattica";
  evs.forEach((e, i) => {
    if (!gagAt.has(i)) return;
    const r = rosterAt(e.min).filter((s) => s.player);
    e.gag = fill(fresh(GAGS), { p: nameOf(pick(r, C)?.player), motto });
  });

  // tabellino
  const sumBy = (list, key) => { const m = new Map(); for (const p of list) if (p) m.set(p.id, { p, n: (m.get(p.id)?.n || 0) + 1 }); return [...m.values()]; };
  const scorers = sumBy(evs.filter((e) => e.team === "us" && e.goal).map((e) => e.scorer));
  const assists = sumBy(evs.filter((e) => e.assist).map((e) => e.assist));
  const oppScorers = new Map();
  for (const e of evs) if (e.team === "them" && e.goal) {
    const k = e.kind === "autogol" ? `aut. ${e.names.V}` : `n.${e.names.S}`;
    oppScorers.set(k, (oppScorers.get(k) || 0) + 1);
  }
  const allOurs = [...L.slots.map((s) => s.player), ...subs.map((s) => s.player)].filter(Boolean);
  const score = (p) => 3 * (scorers.find((x) => x.p.id === p.id)?.n || 0) + 1.5 * (assists.find((x) => x.p.id === p.id)?.n || 0) + (info(p.id).voto || 6) / 10;
  const mvp = allOurs.length ? [...allOurs].sort((a, b) => score(b) - score(a))[0] : null;
  let flop = null;
  if (gThem >= gUs + 2 && L.slots[0].player) flop = L.slots[0].player;
  else {
    const blame = sumBy(evs.filter((e) => e.team === "them" && e.goal).map((e) => e.victim)).sort((a, b) => b.n - a.n)[0];
    const miss = sumBy(evs.filter((e) => e.team === "us" && !e.goal).map((e) => rosterAt(e.min)[e.S].player)).sort((a, b) => b.n - a.n)[0];
    flop = (blame?.p || miss?.p) ?? null;
    if (flop && mvp && flop.id === mvp.id) flop = null;
  }

  return { F, L, opp, oppSlots, subs, evs, gUs, gThem, scorers, assists, oppScorers, mvp, flop, rosterAt };
}

// ---------------- motore grafico ----------------

const COL = {
  us: "#111", usLine: "#c9ef4f", usNum: "#fff", usGk: "#f2b134", usGkNum: "#072526",
  them: "#e4572e", themLine: "#fff", themNum: "#fff", themGk: "#3d7fd9", themGkNum: "#fff",
};

function makePawns(cp) {
  const toBase = (s) => ({ bd: 6 + (100 - s.y - 12) * 0.66, bl: s.x });
  const us = cp.L.slots.map((s, i) => ({ team: "us", i, role: s.role, ...toBase(s), player: s.player, num: shirt(s.player), name: nameOf(s.player), ph: i * 1.7 }));
  const them = cp.oppSlots.map((s, i) => ({ team: "them", i, role: s.role, ...toBase(s), num: s.num, name: `n.${s.num}`, ph: i * 2.3 + 1 }));
  return { us, them };
}

function createSim(canvas, cp, hooks) {
  const ctx = canvas.getContext("2d");
  const st = {
    t: 0, dirUs: 1, poss: "us", mode: "kickoff", fast: false,
    ball: { x: 50, y: 50, z: 0 }, anim: null, dribbler: null, carrier: null,
    over: new Map(), score: { us: 0, them: 0 }, minute: 0, overlay: null,
    pawns: makePawns(cp),
  };
  const all = () => [...st.pawns.us, ...st.pawns.them];
  for (const p of all()) { const a = abs(p.team, Math.min(p.bd, 46), p.bl); p.x = a.x; p.y = a.y; }

  function dir(team) { return team === "us" ? st.dirUs : -st.dirUs; }
  function abs(team, rel, lat) { return dir(team) > 0 ? { x: rel, y: lat } : { x: 100 - rel, y: 100 - lat }; }
  function rel(team, x, y) { return dir(team) > 0 ? { r: x, l: y } : { r: 100 - x, l: 100 - y }; }
  const other = (t) => (t === "us" ? "them" : "us");
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const nearest = (team, pt, excl = []) => st.pawns[team].filter((p) => p.role !== "por" && !excl.includes(p)).sort((a, b) => dist(a, pt) - dist(b, pt))[0];
  const ahead = (p, dr, dl = 0) => { const q = rel(p.team, p.x, p.y); return abs(p.team, clamp(q.r + dr, 3, 97), clamp(q.l + dl, 5, 95)); };
  st.abs = abs; st.rel = rel;

  function shape(p) {
    const b = rel(p.team, st.ball.x, st.ball.y);
    let r, l;
    if (p.role === "por") { r = clamp(4 + (b.r - 50) * 0.05, 2.5, 10); l = 50 + (b.l - 50) * 0.18; }
    else if (st.mode === "kickoff") { r = Math.min(p.bd, 45); l = p.bl; }
    else {
      r = p.bd + (st.poss === p.team ? 10 : -5) + (b.r - 50) * 0.3;
      l = p.bl * 0.8 + 10 + (b.l - 50) * 0.3;
    }
    r += Math.sin(st.t * 1.3 + p.ph) * 1.1;
    l += Math.cos(st.t * 1.1 + p.ph) * 1.1;
    return abs(p.team, clamp(r, 2, 97), clamp(l, 4, 96));
  }

  function step(dt) {
    st.t += dt;
    // palla
    const a = st.anim;
    if (a && st.t < a.t0 + a.dur) {
      const k = clamp((st.t - a.t0) / a.dur, 0, 1);
      const e = a.ease === "lin" ? k : 1 - (1 - k) * (1 - k);
      st.ball.x = a.from.x + (a.to.x - a.from.x) * e;
      st.ball.y = a.from.y + (a.to.y - a.from.y) * e;
      st.ball.z = a.z * 4 * k * (1 - k);
    } else {
      if (a) { st.ball.x = a.to.x; st.ball.y = a.to.y; st.ball.z = 0; st.anim = null; }
      if (st.carrier && !st.dribbler) {
        const c = st.carrier, off = dir(c.team) * 1.4;
        const tx = c.x + off, ty = c.y;
        const d = Math.hypot(tx - st.ball.x, ty - st.ball.y), s = 70 * dt;
        if (d <= s) { st.ball.x = tx; st.ball.y = ty; } else { st.ball.x += ((tx - st.ball.x) / d) * s; st.ball.y += ((ty - st.ball.y) / d) * s; }
      }
    }
    // pressing della squadra che difende
    const press = new Map();
    if (st.mode === "play") {
      const D = other(st.poss);
      const cand = st.pawns[D].filter((p) => p.role !== "por" && !st.over.has(p)).sort((a, b) => dist(a, st.ball) - dist(b, st.ball));
      const g = dir(D) > 0 ? -1 : 1; // verso la propria porta
      if (cand[0]) press.set(cand[0], { x: st.ball.x + g * 2.6, y: st.ball.y });
      if (cand[1]) press.set(cand[1], { x: (st.ball.x + g * 9 + cand[1].x) / 2, y: (st.ball.y + cand[1].y) / 2 });
    }
    for (const p of all()) {
      let tgt, sp = p.role === "por" ? 24 : 19;
      if (p === st.dribbler) { tgt = { x: st.ball.x - dir(p.team) * 1.4, y: st.ball.y }; sp = 60; }
      else if (st.over.has(p)) { tgt = st.over.get(p); sp = p.role === "por" ? 30 : 24; }
      else tgt = press.get(p) || shape(p);
      if (st.fast) sp *= 2.6;
      const dx = tgt.x - p.x, dy = tgt.y - p.y, d = Math.hypot(dx, dy), s = sp * dt;
      if (d <= s) { p.x = tgt.x; p.y = tgt.y; } else { p.x += (dx / d) * s; p.y += (dy / d) * s; }
    }
  }

  // ---- disegno ----
  let W = 0, H = 0, dpr = 1;
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = Math.round(W / 1.6);
    canvas.style.height = H + "px";
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  resize();
  const mx = () => W * 0.045, my = () => H * 0.05;
  const X = (x) => mx() + (x / 100) * (W - 2 * mx());
  const Y = (y) => my() + (y / 100) * (H - 2 * my());

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#256f3c"; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? "#2a8c48" : "#2f9a4f"; ctx.fillRect(X(i * 10), Y(0), X(10) - X(0) + 0.5, Y(100) - Y(0)); }
    ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = Math.max(1.2, W / 450);
    const R = (x1, y1, x2, y2) => ctx.strokeRect(X(x1), Y(y1), X(x2) - X(x1), Y(y2) - Y(y1));
    R(0, 0, 100, 100);
    ctx.beginPath(); ctx.moveTo(X(50), Y(0)); ctx.lineTo(X(50), Y(100)); ctx.stroke();
    ctx.beginPath(); ctx.arc(X(50), Y(50), (Y(100) - Y(0)) * 0.14, 0, Math.PI * 2); ctx.stroke();
    R(0, 24, 15, 76); R(85, 24, 100, 76); R(0, 38, 5, 62); R(95, 38, 100, 62);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    for (const x of [50, 10, 90]) { ctx.beginPath(); ctx.arc(X(x), Y(50), 1.8, 0, Math.PI * 2); ctx.fill(); }
    // porte con la rete
    for (const [x0, x1] of [[-3, 0], [100, 103]]) {
      ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(X(x0), Y(42), X(x1) - X(x0), Y(58) - Y(42));
      ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1;
      for (let y = 42; y <= 58; y += 2) { ctx.beginPath(); ctx.moveTo(X(x0), Y(y)); ctx.lineTo(X(x1), Y(y)); ctx.stroke(); }
      ctx.strokeStyle = "#fff"; ctx.lineWidth = Math.max(2, W / 260); ctx.strokeRect(X(x0), Y(42), X(x1) - X(x0), Y(58) - Y(42));
    }
    // pedine
    const pr = Math.max(8, W * 0.018);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const list = all().sort((a, b) => a.y - b.y);
    for (const p of list) {
      const gk = p.role === "por", us = p.team === "us";
      ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(X(p.x) + pr * 0.25, Y(p.y) + pr * 0.45, pr, pr * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = us ? (gk ? COL.usGk : COL.us) : gk ? COL.themGk : COL.them;
      ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), pr, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = Math.max(1.5, pr * 0.22); ctx.strokeStyle = us ? COL.usLine : COL.themLine; ctx.stroke();
      ctx.fillStyle = us ? (gk ? COL.usGkNum : COL.usNum) : COL.themNum;
      ctx.font = `800 ${Math.round(pr * 1.05)}px Barlow, system-ui, sans-serif`;
      ctx.fillText(String(p.num ?? ""), X(p.x), Y(p.y) + 0.5);
    }
    // nome di chi ha palla
    const c = st.dribbler || st.carrier;
    if (c) {
      ctx.font = `800 ${Math.round(Math.max(10, W * 0.022))}px Barlow, system-ui, sans-serif`;
      const label = String(c.name || "").toUpperCase(), w = ctx.measureText(label).width + 10, h = Math.max(15, W * 0.032);
      const lx = clamp(X(c.x), w / 2 + 2, W - w / 2 - 2), ly = Math.max(h / 2 + 2, Y(c.y) - pr - h * 0.8);
      ctx.fillStyle = c.team === "us" ? "rgba(201,239,79,.95)" : "rgba(255,255,255,.95)";
      ctx.fillRect(lx - w / 2, ly - h / 2, w, h);
      ctx.fillStyle = "#072526"; ctx.fillText(label, lx, ly + 0.5);
    }
    // palla
    const br = Math.max(3.5, W * 0.0085) * (1 + st.ball.z * 0.25);
    ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.beginPath(); ctx.ellipse(X(st.ball.x) + 1, Y(st.ball.y) + 1.5, br * 0.9, br * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    const by = Y(st.ball.y) - st.ball.z * pr * 1.2;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X(st.ball.x), by, br, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#111"; ctx.lineWidth = 1.2; ctx.stroke();
    // scritte in sovrimpressione
    const o = st.overlay;
    if (o && st.t < o.until) {
      const k = clamp((o.until - st.t) / 0.4, 0, 1);
      ctx.globalAlpha = k;
      ctx.fillStyle = "rgba(7,37,38,.55)"; ctx.fillRect(0, H * 0.36, W, H * 0.28);
      ctx.fillStyle = o.color || "#c9ef4f";
      ctx.font = `${Math.round(W * (o.small ? 0.06 : 0.1))}px Anton, Impact, sans-serif`;
      ctx.fillText(o.text, W / 2, H * (o.sub ? 0.47 : 0.5));
      if (o.sub) { ctx.fillStyle = "#fff"; ctx.font = `700 ${Math.round(W * 0.032)}px Barlow, system-ui, sans-serif`; ctx.fillText(o.sub, W / 2, H * 0.585); }
      ctx.globalAlpha = 1;
    }
  }

  // ---- regia: fasi in coda ----
  const Q = [];
  let cur = null;
  function tick(dt) {
    let left = dt;
    while (left > 0) {
      if (!cur) {
        cur = Q.shift();
        if (!cur) { step(left); hooks.done?.(); return false; }
        cur.el = 0;
        cur.start?.(st);
      }
      const d = Math.min(left, cur.dur - cur.el);
      step(d);
      cur.el += d;
      left -= d;
      cur.tick?.(st, clamp(cur.el / cur.dur, 0, 1));
      if (cur.el >= cur.dur - 1e-9) { cur.end?.(st); cur = null; }
    }
    return true;
  }

  return { st, Q, tick, draw, resize, helpers: { abs, rel, other, nearest, ahead, dist, dir } };
}

// ---------------- costruzione delle fasi ----------------

function buildPhases(sim, cp, hooks) {
  const { st, Q } = sim;
  const { abs, other, nearest, ahead, dist } = sim.helpers;
  const P = (team, i) => st.pawns[team][i];
  const say = (text, cls) => hooks.say(st.minute, text, cls);

  // passaggio/dribbling/tiro: fn(st) -> {to, z, receiver, dribbler, moves, after, poss, ease}
  function ball(dur, fn) {
    let g;
    return {
      dur,
      start() {
        g = fn() || {};
        if (g.say) say(g.say, g.cls);
        if (g.poss) st.poss = g.poss;
        if (g.to) st.anim = { from: { x: st.ball.x, y: st.ball.y }, to: g.to, t0: st.t, dur: dur * (g.frac || 1), z: g.z || 0, ease: g.ease };
        st.dribbler = g.dribbler || null;
        if (g.dribbler || g.receiver || g.to) st.carrier = null;
        if (g.receiver) st.over.set(g.receiver, g.to);
        for (const [p, pt] of g.moves || []) st.over.set(p, pt);
        if (g.fast) st.fast = true;
        if (g.overlay) st.overlay = { ...g.overlay, until: st.t + (g.overlay.dur || 1.3) };
        g.start?.();
      },
      end() {
        if (g.receiver) st.over.delete(g.receiver);
        st.dribbler = null;
        st.carrier = g.after !== undefined ? g.after : g.receiver || g.dribbler || null;
        if (g.fast) st.fast = false;
        g.end?.();
      },
    };
  }
  const wait = (dur, fn) => ({ dur, start: () => fn?.() });
  const clearOver = () => wait(0.01, () => st.over.clear());
  const holder = (T) => (st.carrier && st.carrier.team === T ? st.carrier : null);
  const out = () => st.ball.x < 0 || st.ball.x > 100 || st.ball.y < 0 || st.ball.y > 100;

  function kickoff(T, line) {
    return [
      ball(1.1, () => {
        st.mode = "kickoff"; st.over.clear(); st.poss = T;
        const att = st.pawns[T].filter((p) => p.role === "att").pop() || P(T, 7);
        return { to: { x: 50, y: 50 }, ease: "lin", fast: true, moves: [[att, abs(T, 48.6, 50)]], after: att, say: line };
      }),
      wait(0.25, () => { st.mode = "play"; st.over.clear(); }),
    ];
  }

  function filler(T, m0, m1, gag) {
    const steps = [];
    steps.push(ball(0.6, () => {
      st.poss = T;
      if (holder(T)) return { after: holder(T) };
      if (out()) { const k = P(T, 0); return { to: abs(T, 6, 50), receiver: k, fast: true, ease: "lin" }; }
      const n = nearest(T, st.ball);
      return { to: { x: st.ball.x, y: st.ball.y }, receiver: n };
    }));
    const pass = (roles, dr) => ball(0.85, () => {
      const from = holder(T) || nearest(T, st.ball);
      const cand = st.pawns[T].filter((p) => p !== from && roles.includes(p.role));
      const to = cand.length ? cand[Math.floor((st.t * 7.3) % cand.length)] : nearest(T, st.ball, [from]);
      return { to: ahead(to, dr), receiver: to };
    });
    steps.push(pass(["dif", "cen"], 3));
    steps.push(pass(["cen", "att"], 4));
    const tot = steps.reduce((s, x) => s + x.dur, 0);
    let acc = 0;
    for (const s of steps) {
      const a0 = acc / tot, a1 = (acc + s.dur) / tot;
      acc += s.dur;
      s.tick = (_, k) => { st.minute = Math.round(m0 + (m1 - m0) * (a0 + (a1 - a0) * k)); };
    }
    if (gag) { const s0 = steps[1].start; steps[1].start = () => { s0(); say(gag); }; }
    return steps;
  }

  function action(e) {
    const T = e.team, D = other(T);
    const S = () => P(T, e.S), A = () => P(T, e.A), B = () => P(T, e.B), K = () => P(D, 0);
    const V = () => (T === "them" ? P("us", e.V) : P("them", e.V));
    const lat = e.lat, side = e.side;
    const c = () => holder(T) || nearest(T, st.ball);
    const goalLat = 50 + side * (4 + (e.min % 3));
    const steps = [];
    const recv = (p, pt, f = 0.55) => ({ x: p.x + (pt.x - p.x) * f, y: p.y + (pt.y - p.y) * f });
    const prerun = (who, r, l, dur = 0.55) => ball(dur, () => { const h = c(); return { dribbler: h, to: ahead(h, 3), moves: [[who(), abs(T, r, l)]] }; });

    switch (e.tpl) {
      case "manovra":
        steps.push(ball(0.8, () => ({ to: recv(A(), abs(T, 66, lat)), receiver: A(), moves: [[S(), abs(T, 85, 100 - lat)]] })));
        steps.push(ball(0.75, () => ({ dribbler: A(), to: abs(T, 79, lat * 0.6 + 20) })));
        steps.push(ball(0.6, () => ({ to: recv(S(), abs(T, 86, 100 - lat), 0.8), receiver: S() })));
        break;
      case "contropiede":
        steps.push(prerun(S, 64, lat));
        steps.push(ball(1.0, () => ({ to: recv(S(), abs(T, 67, lat), 0.7), receiver: S(), z: 1.3 })));
        steps.push(ball(0.75, () => ({ dribbler: S(), to: abs(T, 79, lat * 0.5 + 25) })));
        steps.push(ball(0.55, () => ({ dribbler: S(), to: abs(T, 87, 50 - side * 6) })));
        break;
      case "fuori":
        steps.push(prerun(S, 66, lat));
        steps.push(ball(0.75, () => ({ to: recv(S(), abs(T, 67, lat), 0.7), receiver: S() })));
        steps.push(ball(0.4, () => ({ dribbler: S(), to: abs(T, 72, lat) })));
        break;
      case "solitaria":
        steps.push(ball(0.75, () => ({ to: ahead(S(), 3), receiver: S() })));
        steps.push(ball(0.6, () => { const q = st.rel(T, S().x, S().y); return { dribbler: S(), to: abs(T, clamp(q.r + 12, 50, 72), clamp(q.l + 10, 15, 85)) }; }));
        steps.push(ball(0.6, () => { const q = st.rel(T, S().x, S().y); return { dribbler: S(), to: abs(T, clamp(q.r + 11, 60, 82), clamp(q.l - 14, 15, 85)) }; }));
        steps.push(ball(0.5, () => ({ dribbler: S(), to: abs(T, 87, 50 + side * 5) })));
        break;
      case "corner": {
        const cy = side > 0 ? 99 : 1;
        steps.push(ball(1.1, () => ({
          to: abs(T, 99.5, cy), receiver: B(), fast: true, ease: "lin", poss: T, say: "Calcio d'angolo.",
          moves: [[S(), abs(T, 87, 50)], [A(), abs(T, 84, 40)], [V(), abs(T, 90, 48)], [K(), abs(T, 98.5, 50)]],
        })));
        steps.push(ball(0.9, () => { const r = e.kind === "autogol" ? V() : S(); return { to: recv(r, abs(T, 89.5, 50 - side * 3), 0.6), receiver: r, z: 2 }; }));
        break;
      }
      case "rigore":
        steps.push(ball(0.75, () => ({ to: ahead(S(), 3), receiver: S() })));
        steps.push(ball(0.8, () => ({ dribbler: S(), to: abs(T, 85, lat < 50 ? 38 : 62), moves: [[V(), abs(T, 86, 50)]] })));
        steps.push(ball(0.9, () => ({ after: null, overlay: { text: "RIGORE!", color: "#f2b134", small: true, dur: 0.9 } })));
        steps.push(ball(1.1, () => {
          const mv = [[S(), abs(T, 85.5, 50)], [K(), abs(T, 99, 50)]];
          for (const p of [...st.pawns.us, ...st.pawns.them]) {
            if (p === S() || p === K() || p.role === "por") continue;
            const q = st.rel(T, p.x, p.y);
            mv.push([p, abs(T, Math.min(q.r, 79), q.l)]);
          }
          return { to: abs(T, 90, 50), ease: "lin", fast: true, moves: mv, after: null };
        }));
        break;
    }

    // tiro
    const kind = e.goal ? "gol" : e.kind === "rigore" ? "parata" : e.kind;
    const shooter = () => (e.kind === "autogol" ? V() : S());
    let shotTo, kpt, z = 0.5;
    const shotDur = e.tpl === "fuori" ? 0.65 : e.tpl === "corner" ? 0.35 : 0.45;
    steps.push(ball(shotDur, () => {
      if (kind === "gol") { shotTo = abs(T, 102, goalLat); kpt = abs(T, 98.5, 100 - goalLat); }
      else if (kind === "parata") { shotTo = abs(T, 97.6, 50 + side * 2.5); kpt = shotTo; }
      else if (kind === "palo") { shotTo = abs(T, 100, side > 0 ? 58.5 : 41.5); kpt = abs(T, 98.5, 50 - side * 3); }
      else if (kind === "traversa") { shotTo = abs(T, 100, 50 + side * 2); kpt = abs(T, 98.5, 50); z = 1.6; }
      else { shotTo = abs(T, 104, side > 0 ? 66 : 34); kpt = abs(T, 98.5, 50 + side * 3); z = 1.4; }
      return { to: shotTo, z, ease: "lin", moves: [[K(), kpt]], after: kind === "parata" ? K() : null };
    }));

    if (kind === "gol") {
      steps.push(ball(1.6, () => {
        st.score[T]++;
        hooks.score(st.score);
        st.mode = "celebrate";
        const sh = shooter();
        const flag = abs(T, 93, st.rel(T, sh.x, sh.y).l > 50 ? 92 : 8);
        const mv = [[sh, flag]];
        if (e.kind !== "autogol") for (const p of st.pawns[T]) if (p !== sh && p.role !== "por") mv.push([p, { x: flag.x + (Math.sin(p.ph) * 5), y: flag.y + Math.cos(p.ph) * 5 }]);
        return {
          say: e.text, cls: "goal", after: null, moves: mv,
          overlay: e.kind === "autogol" ? { text: "AUTOGOL!", color: "#e4572e", dur: 1.5 } : T === "us" ? { text: "GOOOL!", color: "#c9ef4f", dur: 1.5 } : { text: "GOL", color: "#ffffff", sub: cp.opp, dur: 1.5 },
        };
      }));
      steps.push(...kickoff(D));
    } else if (kind === "parata") {
      steps.push(ball(0.7, () => ({ say: e.text, after: K(), poss: D })));
      steps.push(clearOver());
    } else if (kind === "palo" || kind === "traversa") {
      steps.push(ball(0.55, () => ({ say: e.text, to: abs(T, 86, kind === "palo" ? (side > 0 ? 72 : 28) : 50 + side * 10), after: null, poss: D })));
      steps.push(clearOver());
    } else {
      steps.push(wait(0.6, () => { say(e.text); st.poss = D; }));
      steps.push(clearOver());
    }
    for (const s of steps) { const t0 = s.tick; s.tick = (a, k) => { st.minute = e.min; t0?.(a, k); }; }
    return steps;
  }

  const subPhase = (s, half) => wait(half ? 0.01 : 1.1, () => {
    const p = P("us", s.slot);
    const outName = p.name;
    p.player = s.player; p.num = shirt(s.player); p.name = nameOf(s.player);
    say(`🔁 Cambio: entra ${p.name}, esce ${outName} (${s.why}).`);
    if (!half) st.overlay = { text: "CAMBIO", sub: `${p.name} ↔ ${outName}`, small: true, color: "#c9ef4f", until: st.t + 1.1 };
  });

  // ---- sequenza ----
  const casa = cp.casa;
  Q.push(...kickoff("us", `🏟️ Fischio d'inizio! ${dot(`${casa.left} – ${casa.right}`)} Maglia nera per i Gin Tonici, ghiaccio pronto in panchina.`));
  let last = 0, ht = false;
  const halftime = () => {
    Q.push(wait(2.6, () => {
      st.minute = TEMPO;
      say(`⏸️ Fine primo tempo: ${dot(hooks.scoreText(st.score))} Negli spogliatoi si parla di tattica (cioè di cosa bere dopo).`);
      st.overlay = { text: "INTERVALLO", sub: hooks.scoreText(st.score), small: true, color: "#c9ef4f", until: st.t + 2.4 };
      st.dirUs *= -1; st.mode = "kickoff"; st.fast = true; st.over.clear(); st.carrier = null; st.dribbler = null;
      st.anim = { from: { x: st.ball.x, y: st.ball.y }, to: { x: 50, y: 50 }, t0: st.t, dur: 1.2, z: 0, ease: "lin" };
      for (const s of cp.subs) if (s.min === TEMPO) subPhase(s, true).start();
    }));
    Q.push(wait(0.01, () => { st.fast = false; }));
    Q.push(...kickoff("them", "▶️ Si riparte: inizia la ripresa."));
    last = TEMPO;
    ht = true;
  };
  const items = [...cp.evs.map((e) => ({ min: e.min, e })), ...cp.subs.filter((s) => s.min > TEMPO).map((s) => ({ min: s.min + 0.5, s }))].sort((a, b) => a.min - b.min);
  for (const it of items) {
    if (!ht && it.min > TEMPO) halftime();
    if (it.s) { Q.push(subPhase(it.s, false)); continue; }
    const e = it.e;
    Q.push(...filler(e.team, last, e.min, e.gag));
    Q.push(...action(e));
    last = e.min;
  }
  if (!ht) halftime();
  Q.push(...filler(cp.evs.length % 2 ? "us" : "them", last, 2 * TEMPO));
  Q.push(wait(2.2, () => {
    st.minute = 2 * TEMPO;
    say(`🏁 Triplice fischio: ${dot(hooks.scoreText(st.score))} ${st.score.us > st.score.them ? "Tre punti e giro offerto dal capitano!" : st.score.us === st.score.them ? "Mezzo bicchiere: pareggio." : "Si annega il dispiacere al bar."}`);
    st.overlay = { text: "FINALE", sub: hooks.scoreText(st.score), small: true, color: "#c9ef4f", until: st.t + 2.2 };
    st.mode = "kickoff"; st.over.clear(); st.carrier = null;
  }));
  return Q.reduce((s, x) => s + x.dur, 0);
}

// ---------------- finestra ----------------

const fmt1 = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(".", ",");

export function openSimulazione(match, data) {
  const cp = copione(data, match);
  const noi = data.squadra?.nome || "Gin Tonici F.C.";
  const home = match.casa !== false;
  cp.casa = { left: home ? noi : cp.opp, right: home ? cp.opp : noi };
  const scoreText = (s) => (home ? `${noi} ${s.us}–${s.them} ${cp.opp}` : `${cp.opp} ${s.them}–${s.us} ${noi}`);

  document.querySelector("dialog.simula")?.remove();
  const dlg = document.createElement("dialog");
  dlg.className = "distinta simula";
  const row = (r, form) => r ? `${fmt1(r.gf / Math.max(1, r.g))} fatti · ${fmt1(r.gs / Math.max(1, r.g))} subiti a partita${form ? ` · ultime ${form.n}: ${fmt1(form.gf)}–${fmt1(form.gs)}` : ""}` : "dati non ancora disponibili";
  dlg.innerHTML = `
    <form method="dialog" class="dist-head">
      <div>
        <div class="label">Simulazione${match.giornata ? ` · ${esc(match.giornata)}ª giornata` : ""} · ${esc(fmtDate(match.data, true))}</div>
        <h3>${esc(cp.casa.left)} <span>–</span> ${esc(cp.casa.right)}</h3>
      </div>
      <button class="dist-x" aria-label="Chiudi">×</button>
    </form>
    <div class="sim-board" aria-live="polite">
      <div class="sim-team${home ? " us" : ""}">${esc(cp.casa.left)}</div>
      <div class="sim-score"><b data-l>0</b><i>–</i><b data-r>0</b></div>
      <div class="sim-team r${home ? "" : " us"}">${esc(cp.casa.right)}</div>
      <div class="sim-clock" data-clock>0'</div>
    </div>
    <div class="sim-stage">
      <canvas class="sim-canvas" aria-label="Campo da calcio con la simulazione della partita"></canvas>
      <div class="sim-intro">
        <div class="sim-intro-box">
          <div class="label">Pronostico ufficiale (si fa per dire)</div>
          <p><strong>${esc(noi)}</strong>: ${row(cp.F.us.row, cp.F.us.form)}</p>
          <p><strong>${esc(cp.opp)}</strong>: ${row(cp.F.them.row, cp.F.them.form)}</p>
          <p class="small">${cp.L.auto ? "Il mister non ha diramato la formazione completa: in campo i più presenti." : `In campo la formazione del mister (${esc(cp.L.modulo)}).`}</p>
          <button type="button" class="btn lime" data-go>▶ Fischio d'inizio</button>
        </div>
      </div>
      <div class="sim-end" hidden></div>
    </div>
    <div class="sim-controls">
      <button type="button" class="btn" data-speed aria-pressed="false">⏩ 2x</button>
      <button type="button" class="btn" data-skip>⏭ Salta al risultato</button>
      <span class="small sim-speed">Velocità 1,5x</span>
    </div>
    <ol class="sim-ticker" reversed></ol>`;
  document.body.appendChild(dlg);

  const canvas = dlg.querySelector("canvas");
  const ticker = dlg.querySelector(".sim-ticker");
  const elL = dlg.querySelector("[data-l]"), elR = dlg.querySelector("[data-r]"), clock = dlg.querySelector("[data-clock]");
  const lines = [];
  const hooks = {
    say(min, text, cls) {
      lines.push({ min, text });
      const li = document.createElement("li");
      li.innerHTML = `<b>${esc(min)}'</b> ${esc(text)}`;
      if (cls) li.className = cls;
      ticker.prepend(li);
    },
    score(s) { elL.textContent = home ? s.us : s.them; elR.textContent = home ? s.them : s.us; },
    scoreText,
    done() {},
  };

  dlg.showModal();
  const sim = createSim(canvas, cp, hooks);
  const total = buildPhases(sim, cp, hooks);
  const base = Math.max(BASE_SPEED, total / MAX_SEC);
  let fast = false, running = false, finished = false, raf = 0, lastTs = 0;
  const speed = () => base * (fast ? FAST_SPEED / BASE_SPEED : 1);

  function frame(ts) {
    if (!running) return;
    const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
    lastTs = ts;
    const alive = sim.tick(dt * speed());
    clock.textContent = `${sim.st.minute}'`;
    sim.draw();
    if (!alive) return finish();
    raf = requestAnimationFrame(frame);
  }
  function finish() {
    if (finished) return;
    finished = running = false;
    cancelAnimationFrame(raf);
    finished = true;
    sim.st.score = { us: cp.gUs, them: cp.gThem };
    hooks.score(sim.st.score);
    clock.textContent = `${2 * TEMPO}' · FINALE`;
    dlg.querySelector(".sim-intro")?.remove();
    dlg.querySelector("[data-skip]").disabled = true;
    dlg.querySelector("[data-speed]").disabled = true;
    showEnd();
  }
  function showEnd() {
    const list = (arr) => arr.map((x) => `${esc(nameOf(x.p))}${x.n > 1 ? ` (${x.n})` : ""}`).join(", ");
    const opp = [...cp.oppScorers].map(([k, n]) => `${esc(k)}${n > 1 ? ` (${n})` : ""}`).join(", ");
    const e = cp.gUs > cp.gThem ? "V" : cp.gUs < cp.gThem ? "P" : "N";
    const box = dlg.querySelector(".sim-end");
    box.innerHTML = `<div class="sim-end-box">
      <div class="label">Risultato finale simulato</div>
      <div class="sim-final">${esc(scoreText({ us: cp.gUs, them: cp.gThem }))}</div>
      <span class="badge ${e}">${e}</span>
      ${cp.scorers.length ? `<p>⚽ ${list(cp.scorers)}</p>` : `<p>⚽ Nessun gol dei Gin Tonici. Si dà la colpa al prato.</p>`}
      ${opp ? `<p class="small">Per ${esc(cp.opp)}: ${opp}</p>` : ""}
      <div class="awards">
        ${cp.mvp ? `<div class="award mvp"><div class="t">🍋 Fetta di Lime d'Oro (virtuale)</div><div class="n">${esc(nameOf(cp.mvp))}</div></div>` : ""}
        ${cp.flop ? `<div class="award flop"><div class="t">🫧 Tonica Sgasata (virtuale)</div><div class="n">${esc(nameOf(cp.flop))}</div></div>` : ""}
      </div>
      <p class="small">Pronostico fisso per questa partita: ripetendo la simulazione il risultato non cambia. Il campo, però, ha sempre l'ultima parola.</p>
      <button type="button" class="btn" data-replay>↺ Rivedi la partita</button>
    </div>`;
    box.hidden = false;
    box.querySelector("[data-replay]").addEventListener("click", () => { dlg.close(); openSimulazione(match, data); });
  }

  const onResize = () => { sim.resize(); sim.draw(); };
  window.addEventListener("resize", onResize);
  sim.draw();

  dlg.querySelector("[data-go]").addEventListener("click", () => {
    dlg.querySelector(".sim-intro").remove();
    running = true;
    lastTs = performance.now();
    raf = requestAnimationFrame(frame);
  });
  dlg.querySelector("[data-speed]").addEventListener("click", (ev) => {
    fast = !fast;
    ev.currentTarget.setAttribute("aria-pressed", fast);
    ev.currentTarget.textContent = fast ? "▶ 1,5x" : "⏩ 2x";
    dlg.querySelector(".sim-speed").textContent = `Velocità ${fast ? "2x" : "1,5x"}`;
  });
  dlg.querySelector("[data-skip]").addEventListener("click", () => {
    // cronaca completa in un colpo solo
    running = false;
    cancelAnimationFrame(raf);
    let guard = 0;
    while (sim.tick(0.25) && guard++ < 5000);
    sim.draw();
    finish();
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener("close", () => { running = false; cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); dlg.remove(); });
}

// Per i test: il copione senza grafica
export const _copione = copione;
