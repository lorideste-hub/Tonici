import {
  esc, loadData, fmtDate, fmtDateTime, isPlayed, esito, sortedMatches, lastMatch, nextMatch,
  isUs, parseScorers, scorersTable, matchPlayer, sortedStandings, votoClass, parseISODate,
  fmtCompleanno, nextBirthdays,
} from "./common.js";

const NAV = [
  ["home", "/", "Home"],
  ["societa", "/societa.html", "La Società"],
  ["squadra", "/squadra.html", "La Squadra"],
  ["pagelle", "/pagelle.html", "Le Pagelle"],
  ["calendario", "/calendario.html", "Calendario"],
  ["classifica", "/classifica.html", "Classifica"],
  ["foto", "/foto.html", "Foto"],
];
const MVP_LABEL = "Fetta di Lime d'Oro";
const FLOP_LABEL = "Tonica Sgasata";

const page = document.body.dataset.page;

function shell(data) {
  const name = esc(data.squadra?.nome || "Gin Tonici F.C.");
  const nav = NAV.map(([k, href, label]) => `<a href="${href}"${k === page ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  document.getElementById("header").innerHTML = `
    ${data.demo ? `<div class="demo-banner">Stai guardando dati di esempio: sostituiscili dall'<a href="/admin.html">area Admin</a>.</div>` : ""}
    <header class="site-header">
      <div class="wrap">
        <a class="brand" href="/"><img src="/assets/logo.svg" alt=""><span>${name}</span></a>
        <button class="menu-btn" aria-expanded="false" aria-controls="nav">Menu</button>
        <nav class="nav" id="nav">${nav}</nav>
      </div>
    </header>`;
  const btn = document.querySelector(".menu-btn");
  btn.addEventListener("click", () => {
    const open = document.getElementById("nav").classList.toggle("open");
    btn.setAttribute("aria-expanded", open);
  });
  document.getElementById("footer").innerHTML = `
    <footer class="site-footer">
      <div class="wrap">
        <div><span class="slogan">Bevi responsabilmente, gioca irresponsabilmente.</span><br>${name} · ${esc(data.squadra?.campionato || "")}</div>
        <div>${data.aggiornato ? `Aggiornato il ${fmtDateTime(data.aggiornato)} · ` : ""}<a href="/admin.html">Admin</a></div>
      </div>
    </footer>`;
}

const pageHead = (title, sub = "") =>
  `<section class="page-head"><div class="wrap"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ""}</div></section>`;

function teams(p, data) {
  const us = esc(data.squadra?.nome || "Gin Tonici F.C.");
  const them = esc(p.avversario || "Avversario");
  return p.casa === false
    ? { left: them, right: us, leftUs: false, gl: p.gs, gr: p.gf }
    : { left: us, right: them, leftUs: true, gl: p.gf, gr: p.gs };
}

function resultCard(p, data) {
  if (!p) return `<div class="card"><div class="label">Ultimo risultato</div><p class="empty">Nessuna partita giocata… per ora siamo imbattuti.</p></div>`;
  const t = teams(p, data);
  const e = esito(p);
  const pag = (data.pagelle || []).find((x) => x.partitaId === p.id);
  const sc = parseScorers(p.marcatori);
  return `<div class="card">
    <div class="label">Ultimo risultato · ${p.giornata ? `${esc(p.giornata)}ª giornata · ` : ""}${fmtDate(p.data)}</div>
    <div class="scoreline">
      <div class="team ${t.leftUs ? "us" : ""}">${t.left}</div>
      <div class="score">${esc(t.gl)} – ${esc(t.gr)}</div>
      <div class="team right ${!t.leftUs ? "us" : ""}">${t.right}</div>
    </div>
    <div><span class="badge ${e}">${e}</span> <span class="meta">${e === "V" ? "Si brinda!" : e === "N" ? "Mezzo bicchiere" : "Si annega il dispiacere"}</span></div>
    ${sc.length ? `<div class="scorers">⚽ ${sc.map((s) => esc(s.nome) + (s.gol > 1 ? ` (${s.gol})` : "")).join(", ")}</div>` : ""}
    ${pag ? `<a class="more" href="/pagelle.html#${esc(pag.id)}">Leggi le pagelle →</a>` : ""}
  </div>`;
}

function nextCard(p, data) {
  if (!p) return `<div class="card"><div class="label">Prossima partita</div><p class="empty">Calendario ancora da definire.</p></div>`;
  const d = parseISODate(p.data);
  let cd = "";
  if (d) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = Math.round((d - today) / 86400000);
    cd = days === 0 ? "È stasera!" : days === 1 ? "Domani!" : `Mancano ${days} giorni`;
  }
  return `<div class="card">
    <div class="label">Prossima partita${p.giornata ? ` · ${esc(p.giornata)}ª giornata` : ""}</div>
    <div class="next-date">${fmtDate(p.data, true)}${p.ora ? ` · ${esc(p.ora)}` : ""}</div>
    <p style="margin:8px 0 0;font-size:1.15rem"><strong>vs ${esc(p.avversario)}</strong> <span class="meta">(${p.casa === false ? "trasferta" : "in casa"})</span></p>
    <div class="meta">${esc(data.squadra?.campo || "")}${p.campo ? ` · campo ${esc(p.campo.replace(/^bottagisio\s*/i, ""))}` : ""}</div>
    ${cd ? `<span class="countdown">${cd}</span>` : ""}
  </div>`;
}

function standingsTable(data, compact = false) {
  const rows = sortedStandings(data);
  if (!rows.length) return `<p class="empty">Classifica non ancora disponibile.</p>`;
  let list = rows.map((r, i) => ({ ...r, pos: i + 1 }));
  if (compact && list.length > 6) {
    const usIdx = list.findIndex((r) => isUs(r.squadra, data));
    const top = list.slice(0, 5);
    if (usIdx >= 5) top.push({ gap: true }, list[usIdx]);
    list = top;
  }
  const head = compact
    ? `<tr><th>#</th><th class="l">Squadra</th><th>G</th><th>Pt</th></tr>`
    : `<tr><th>#</th><th class="l">Squadra</th><th>Pt</th><th>G</th><th>V</th><th>N</th><th>P</th><th>GF</th><th>GS</th><th>DR</th></tr>`;
  const v = (x) => (x === undefined || x === null ? "–" : esc(x));
  const body = list.map((r) => {
    if (r.gap) return `<tr><td colspan="${compact ? 4 : 10}" class="small">…</td></tr>`;
    const us = isUs(r.squadra, data) ? ' class="us"' : "";
    const dr = r.gf !== undefined && r.gs !== undefined ? r.gf - r.gs : r.dr;
    return compact
      ? `<tr${us}><td class="pos">${r.pos}</td><td class="l">${esc(r.squadra)}</td><td>${v(r.g)}</td><td class="pts">${v(r.pt)}</td></tr>`
      : `<tr${us}><td class="pos">${r.pos}</td><td class="l">${esc(r.squadra)}</td><td class="pts">${v(r.pt)}</td><td>${v(r.g)}</td><td>${v(r.v)}</td><td>${v(r.n)}</td><td>${v(r.p)}</td><td>${v(r.gf)}</td><td>${v(r.gs)}</td><td>${dr === undefined ? "–" : (dr > 0 ? "+" : "") + dr}</td></tr>`;
  }).join("");
  return `<div class="table-wrap"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function scorersHTML(data, limit) {
  let rows = scorersTable(data);
  if (!rows.length) return `<p class="empty">Ancora nessun gol. Il Bomber si sta scaldando.</p>`;
  if (limit) rows = rows.slice(0, limit);
  return `<div class="table-wrap"><table><thead><tr><th>#</th><th class="l">Giocatore</th><th>Gol</th></tr></thead><tbody>${rows
    .map((r, i) => {
      const pl = matchPlayer(r.nome, data.rosa);
      return `<tr><td class="pos">${i + 1}</td><td class="l">${esc(pl ? pl.nome : r.nome)}${pl?.soprannome ? ` <span class="small">“${esc(pl.soprannome)}”</span>` : ""}</td><td class="pts">${r.gol}</td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}

function linksHTML(data) {
  const links = [...(data.link || [])];
  if (data.squadra?.linkCampionato && !links.some((l) => l.url === data.squadra.linkCampionato)) links.unshift({ titolo: "Sito del campionato", url: data.squadra.linkCampionato });
  if (!links.length) return "";
  return `<div class="links">${links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.titolo)} ↗</a>`).join("")}</div>`;
}

function bday(data) {
  const list = nextBirthdays(data.rosa, 30).slice(0, 3);
  if (!list.length) return "";
  return `<div class="card section bday">
    <div class="label">Il prossimo giro lo offre…</div>
    ${list.map(({ player: p, days }) => `<div class="bday-row"><span class="bday-ico">🎂</span><div><strong>${esc(p.soprannome || p.nome)}</strong>${p.soprannome ? ` <span class="small">${esc(p.nome)}</span>` : ""}<div class="small">${days === 0 ? "Oggi! Tutti da Piero" : days === 1 ? "Domani" : `${fmtCompleanno(p.compleanno)} · tra ${days} giorni`}</div></div></div>`).join("")}
  </div>`;
}

// ---------------- PAGINE ----------------

function renderHome(data) {
  const last = lastMatch(data);
  const next = nextMatch(data);
  const pag = [...(data.pagelle || [])].sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
  const links = linksHTML(data);
  return `
  <section class="hero">
    <div class="wrap">
      <img class="crest" src="/assets/logo.svg" alt="Stemma ${esc(data.squadra?.nome)}">
      <div>
        <div class="kicker">${esc(data.squadra?.campionato || "")}</div>
        <h1>${esc(data.squadra?.nome || "Gin Tonici F.C.")}</h1>
        <p class="motto">“${esc(data.squadra?.motto || "")}”</p>
      </div>
    </div>
  </section>
  <main>
    <div class="wrap">
      <div class="grid grid-2 overlap">
        ${resultCard(last, data)}
        ${nextCard(next, data)}
      </div>
      ${data.squadra?.fotoSquadra ? `<figure class="team-photo section"><img src="${esc(data.squadra.fotoSquadra)}" alt="Foto di squadra ${esc(data.squadra?.nome)}"><figcaption>${esc(data.squadra?.nome)} · stagione ${new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1}/${String((new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1) + 1).slice(2)}</figcaption></figure>` : ""}
      <div class="grid grid-2 section">
        <div class="card">
          <h3>Classifica</h3>
          ${standingsTable(data, true)}
          <a class="more" href="/classifica.html">Classifica completa →</a>
        </div>
        <div class="card">
          <h3>Marcatori</h3>
          ${scorersHTML(data, 5)}
          <a class="more" href="/classifica.html#marcatori">Tutti i marcatori →</a>
        </div>
      </div>
      ${pag ? `<div class="card section">
        <div class="label">Ultime pagelle</div>
        <h3>${esc(pag.titolo || "Pagelle")}</h3>
        <div class="awards">
          ${pag.mvp ? `<div class="award mvp"><div class="t">🍋 ${MVP_LABEL}</div><div class="n">${esc(pag.mvp)}</div></div>` : ""}
          ${pag.flop ? `<div class="award flop"><div class="t">🫧 ${FLOP_LABEL}</div><div class="n">${esc(pag.flop)}</div></div>` : ""}
        </div>
        <a class="btn" href="/pagelle.html#${esc(pag.id)}">Leggi tutti i voti</a>
      </div>` : ""}
      ${bday(data)}
      ${links ? `<div class="section"><h2>Link utili</h2>${links}</div>` : ""}
    </div>
  </main>`;
}

function renderSocieta(data) {
  const s = data.societa || {};
  const org = s.organigramma || [];
  return `${pageHead("La Società", esc(data.squadra?.fondazione ? `Fondata nel ${data.squadra.fondazione} · ${data.squadra.campo || ""}` : data.squadra?.campo || ""))}
  <main><div class="wrap">
    <div class="section"><div class="prose">${esc(s.intro || "")}</div></div>
    ${org.length ? `<div class="section"><h2>Organigramma</h2><div class="org">${org
      .map((o) => `<div class="card"><div class="role">${esc(o.ruolo)}</div><div class="name">${esc(o.nome)}</div>${o.nota ? `<div class="small">${esc(o.nota)}</div>` : ""}</div>`)
      .join("")}</div></div>` : ""}
    ${s.valori ? `<div class="section card"><h3>I nostri valori</h3><div class="prose">${esc(s.valori)}</div></div>` : ""}
    ${linksHTML(data) ? `<div class="section"><h2>Link utili</h2>${linksHTML(data)}</div>` : ""}
  </div></main>`;
}

function playerStats(pl, data) {
  // Il nome viene risolto su tutta la rosa: "BAFFA" in pagella è uno solo dei due Baffa
  const isMe = (name) => matchPlayer(name, data.rosa) === pl;
  const goals = scorersTable(data).filter((s) => isMe(s.nome)).reduce((a, s) => a + s.gol, 0);
  const votes = [];
  for (const pg of data.pagelle || []) for (const v of pg.voti || []) if (v.valore !== null && isMe(v.nome)) votes.push(v.valore);
  const avg = votes.length ? votes.reduce((a, b) => a + b, 0) / votes.length : null;
  const mvps = (data.pagelle || []).filter((pg) => pg.mvp && isMe(pg.mvp)).length;
  return { goals, avg, n: votes.length, mvps };
}

function renderSquadra(data) {
  const ORDER = ["Portiere", "Difensore", "Centrocampista", "Attaccante", "Jolly", "Staff"];
  const PLURAL = { Portiere: "Portieri", Difensore: "Difensori", Centrocampista: "Centrocampisti", Attaccante: "Attaccanti", Jolly: "Jolly", Staff: "Staff tecnico", Rosa: "La rosa" };
  const rosa = data.rosa || [];
  if (!rosa.length) return `${pageHead("La Squadra")}<main><div class="wrap"><p class="empty">La rosa arriva presto: il mister sta ancora facendo i provini.</p></div></main>`;
  const groups = {};
  for (const p of rosa) (groups[p.ruolo || "Rosa"] ||= []).push(p);
  const keys = [...ORDER.filter((k) => groups[k]), ...Object.keys(groups).filter((k) => !ORDER.includes(k))];
  return `${pageHead("La Squadra", `${rosa.length} elementi, zero alibi`)}
  <main><div class="wrap">
    ${data.squadra?.fotoSquadra ? `<figure class="team-photo"><img src="${esc(data.squadra.fotoSquadra)}" alt="Foto di squadra"></figure>` : ""}
    ${keys.map((k) => `
      <h2 class="role-title">${esc(PLURAL[k] || k)}</h2>
      <div class="grid grid-3">${groups[k]
        .sort((a, b) => (a.numero === "" || a.numero == null ? 999 : a.numero) - (b.numero === "" || b.numero == null ? 999 : b.numero) || a.nome.localeCompare(b.nome))
        .map((p) => {
          const st = playerStats(p, data);
          const initials = (p.nome || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
          return `<div class="card player">
            <div class="avatar">${p.foto ? `<img src="${esc(p.foto)}" alt="${esc(p.nome)}" loading="lazy">` : esc(initials)}${p.numero ? `<span class="num">${esc(p.numero)}</span>` : ""}</div>
            <div>
              <h3>${esc(p.nome)}</h3>
              ${p.soprannome ? `<div class="nick">“${esc(p.soprannome)}”</div>` : ""}
              ${p.bio ? `<div class="small" style="margin-top:4px">${esc(p.bio)}</div>` : ""}
              ${k !== "Staff" ? `<div class="stats">
                <span class="chip">⚽ ${st.goals}</span>
                ${st.avg !== null ? `<span class="chip">Media ${st.avg.toFixed(2).replace(".", ",")}</span>` : ""}
                ${st.mvps ? `<span class="chip">🍋 ×${st.mvps}</span>` : ""}
                ${p.compleanno ? `<span class="chip">🎂 ${fmtCompleanno(p.compleanno)}</span>` : ""}
              </div>` : ""}
            </div>
          </div>`;
        })
        .join("")}</div>`).join("")}
  </div></main>`;
}

function renderPagelle(data) {
  const list = [...(data.pagelle || [])].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const target = decodeURIComponent(location.hash.slice(1));
  const body = list.length
    ? list.map((pg, i) => {
        const p = (data.partite || []).find((x) => x.id === pg.partitaId);
        const t = p ? teams(p, data) : null;
        const open = target ? target === pg.id : i === 0;
        return `<details class="card pagella section" id="${esc(pg.id)}"${open ? " open" : ""}>
          <summary>
            <div>
              <div class="label">${p ? `${p.giornata ? `${esc(p.giornata)}ª giornata · ` : ""}${fmtDate(p.data)} · ${t.left} ${esc(t.gl ?? "")}–${esc(t.gr ?? "")} ${t.right}` : fmtDate(pg.data)}</div>
              <h3>${esc(pg.titolo || "Pagelle")}</h3>
            </div>
            <span class="chev" aria-hidden="true">›</span>
          </summary>
          <div class="body">
            ${pg.foto ? `<img class="pagella-photo" src="${esc(pg.foto)}" alt="" loading="lazy">` : ""}
            ${pg.intro ? `<div class="intro">${esc(pg.intro)}</div>` : ""}
            <div class="awards">
              ${pg.mvp ? `<div class="award mvp"><div class="t">🍋 ${MVP_LABEL}</div><div class="n">${esc(pg.mvp)}</div></div>` : ""}
              ${pg.flop ? `<div class="award flop"><div class="t">🫧 ${FLOP_LABEL}</div><div class="n">${esc(pg.flop)}</div></div>` : ""}
            </div>
            <div class="votes">${(pg.voti || [])
              .map((v) => `<div class="vote"><div class="vnum ${votoClass(v.valore)}">${esc(v.voto)}</div>
                <div><div class="who">${esc(v.nome)}${pg.mvp && v.nome === pg.mvp ? '<span class="tag">🍋</span>' : ""}${pg.flop && v.nome === pg.flop ? '<span class="tag">🫧</span>' : ""}</div>
                ${v.etichetta ? `<div class="etichetta">${esc(v.etichetta)}</div>` : ""}
                <div class="what">${esc(v.commento)}</div></div></div>`)
              .join("")}</div>
          </div>
        </details>`;
      }).join("")
    : `<p class="empty">Nessuna pagella ancora. L'addetto stampa sta affilando la penna.</p>`;

  // media voto stagionale
  const agg = new Map();
  for (const pg of list) for (const v of pg.voti || []) {
    if (v.valore === null || v.valore === undefined) continue;
    const pl = matchPlayer(v.nome, data.rosa);
    const key = pl ? pl.id : v.nome.toLowerCase();
    const cur = agg.get(key) || { nome: pl ? pl.nome : v.nome, sum: 0, n: 0, mvp: 0 };
    cur.sum += v.valore; cur.n++;
    if (pg.mvp && pg.mvp === v.nome) cur.mvp++;
    agg.set(key, cur);
  }
  const avgRows = [...agg.values()].map((r) => ({ ...r, avg: r.sum / r.n })).sort((a, b) => b.avg - a.avg);
  const avgTable = avgRows.length > 0 && list.length > 0 ? `<div class="card section"><h3>Media voto stagionale</h3><div class="table-wrap"><table>
      <thead><tr><th>#</th><th class="l">Giocatore</th><th>Presenze</th><th>🍋</th><th>Media</th></tr></thead>
      <tbody>${avgRows.map((r, i) => `<tr><td class="pos">${i + 1}</td><td class="l">${esc(r.nome)}</td><td>${r.n}</td><td>${r.mvp || ""}</td><td class="pts">${r.avg.toFixed(2).replace(".", ",")}</td></tr>`).join("")}</tbody>
    </table></div></div>` : "";

  return `${pageHead("Le Pagelle", "Voti insindacabili, commenti querelabili")}
  <main><div class="wrap">${body}${avgTable}</div></main>`;
}

function renderCalendario(data) {
  const list = sortedMatches(data);
  const next = nextMatch(data);
  const rows = list.length
    ? list.map((p) => {
        const e = esito(p);
        const pg = (data.pagelle || []).find((x) => x.partitaId === p.id);
        return `<div class="match-row${next && next.id === p.id ? " next" : ""}">
          <div class="g">${p.giornata ? `${esc(p.giornata)}ª` : ""}</div>
          <div class="when">${fmtDate(p.data)}<small>${esc(p.ora || "")}</small></div>
          <div class="vs">${p.casa === false ? "@ " : "vs "}${esc(p.avversario)}<small>${p.casa === false ? "Trasferta" : "Casa"}${p.campo ? ` · ${esc(p.campo)}` : ""}${pg ? ` · <a href="/pagelle.html#${esc(pg.id)}">pagelle</a>` : ""}</small></div>
          <div class="res">${isPlayed(p) ? `${esc(p.gf)}–${esc(p.gs)} <span class="badge ${e}">${e}</span>` : next && next.id === p.id ? '<span class="tag-next">Prossima</span>' : ""}</div>
        </div>`;
      }).join("")
    : `<p class="empty" style="padding:16px">Calendario non ancora pubblicato.</p>`;
  const played = list.filter(isPlayed);
  const rec = { V: 0, N: 0, P: 0 };
  played.forEach((p) => rec[esito(p)]++);
  return `${pageHead("Calendario", `${esc(data.squadra?.campo || "")}${played.length ? ` · Bilancio: ${rec.V}V ${rec.N}N ${rec.P}P` : ""}`)}
  <main><div class="wrap"><div class="card" style="padding:0;overflow:hidden">${rows}</div></div></main>`;
}

function renderClassifica(data) {
  const upd = data.classificaAggiornata ? `Aggiornata il ${fmtDateTime(data.classificaAggiornata)}` : "";
  return `${pageHead("Classifica", esc(data.squadra?.campionato || ""))}
  <main><div class="wrap">
    <div class="card">${standingsTable(data)}
      <p class="small" style="margin-top:12px">${upd}${data.squadra?.linkCampionato ? ` · Fonte: <a href="${esc(data.squadra.linkCampionato)}" target="_blank" rel="noopener">sito ufficiale del campionato ↗</a>` : ""}</p>
    </div>
    <div class="card section" id="marcatori"><h3>Marcatori ${esc(data.squadra?.nome || "")}</h3>${scorersHTML(data)}${data.marcatoriUfficiali?.length ? `<p class="small" style="margin-top:12px">Dati ufficiali del campionato</p>` : ""}</div>
  </div></main>`;
}

function renderFoto(data) {
  const foto = [...(data.foto || [])].reverse();
  const html = `${pageHead("Foto", "Le prove fotografiche (quelle presentabili)")}
  <main><div class="wrap">${
    foto.length
      ? `<div class="gallery">${foto.map((f, i) => `<figure data-i="${i}"><img src="${esc(f.url)}" alt="${esc(f.didascalia || "")}" loading="lazy">${f.didascalia ? `<figcaption>${esc(f.didascalia)}</figcaption>` : ""}</figure>`).join("")}</div>
         <dialog class="lightbox"><img alt=""><p></p></dialog>`
      : `<p class="empty">Nessuna foto ancora. Qualcuno si ricordi di scattarne una prima del terzo tempo.</p>`
  }</div></main>`;
  setTimeout(() => {
    const dlg = document.querySelector("dialog.lightbox");
    if (!dlg) return;
    document.querySelectorAll(".gallery figure").forEach((fig) =>
      fig.addEventListener("click", () => {
        const f = foto[Number(fig.dataset.i)];
        dlg.querySelector("img").src = f.url;
        dlg.querySelector("p").textContent = f.didascalia || "";
        dlg.showModal();
      })
    );
    dlg.addEventListener("click", () => dlg.close());
  });
  return html;
}

const RENDER = { home: renderHome, societa: renderSocieta, squadra: renderSquadra, pagelle: renderPagelle, calendario: renderCalendario, classifica: renderClassifica, foto: renderFoto };

(async () => {
  const app = document.getElementById("app");
  try {
    const data = await loadData();
    shell(data);
    app.innerHTML = (RENDER[page] || renderHome)(data);
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<main><div class="wrap"><p class="empty">Il sito è andato a prendere da bere. Riprova tra poco.</p></div></main>`;
  }
})();
