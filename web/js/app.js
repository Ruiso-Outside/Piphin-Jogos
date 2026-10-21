// Piphin Jogos · telas: biblioteca, página do jogo, estatísticas, sorteio ("O que jogar?") e espaço em disco.
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const call = async (ch, ...a) => { const r = await piphin.invoke(ch, ...a); if (!r.ok) throw new Error(r.error); return r.data; };
const hm = (m) => { m = Math.round(m || 0); if (m < 60) return `${m} min`; const h = Math.floor(m / 60), r = m % 60; return h >= 100 || !r ? `${h.toLocaleString("pt-BR")} h` : `${h} h ${r} min`; };
const hours = (m) => (m >= 600 ? Math.round(m / 60).toLocaleString("pt-BR") : (m / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 }));
const gb = (b) => (b >= 1e12 ? (b / 1e12).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " TB" : b >= 1e9 ? (b / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " GB" : b > 0 ? Math.round(b / 1e6) + " MB" : "—");
const ago = (t) => {
  if (!t) return "nunca";
  const day0 = (x) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const d = Math.round((day0(Date.now()) - day0(t)) / 86400000); // dias do calendário (ontem à noite é "ontem")
  if (d <= 0) return "hoje"; if (d === 1) return "ontem"; if (d < 7) return `há ${d} dias`; if (d < 30) return `há ${Math.floor(d / 7)} semana${d >= 14 ? "s" : ""}`;
  if (d < 365) { const m = Math.floor(d / 30); return `há ${m} ${m === 1 ? "mês" : "meses"}`; } const y = Math.floor(d / 365); return `há ${y} ano${y > 1 ? "s" : ""}`;
};
const dateBR = (t) => new Date(t).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
const WD = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const S = { tab: "library", view: null, data: null, info: {}, q: "", launcher: "all", sort: "recent", favOnly: false, prefs: null, pickOpts: { stale: false, fav: false }, picking: false };
const G = () => (S.data ? S.data.games : []);
const visible = () => G().filter((g) => !g.hidden);
const P = (id) => (S.data && S.data.stats.perGame[id]) || { total: 0, tracked: 0, sessions: 0, avg: 0, longest: 0, lastPlayed: 0, last30: [] };
const byId = (id) => G().find((g) => g.id === id);
const isLive = (id) => S.data && S.data.live.some((l) => l.id === id);

// ---------------------------------------------------------------- avisos, janelas, menus e dicas
function toast(text, kind = "") { const el = document.createElement("div"); el.className = "toast " + kind; el.textContent = text; $("#toasts").appendChild(el); setTimeout(() => el.remove(), 4200); }
const modal = $("#modal"), box = $("#modalBox");
const openModal = (html, cls = "") => { box.className = "modal-box " + cls; box.innerHTML = html; modal.hidden = false; };
const closeModal = () => { modal.hidden = true; box.innerHTML = ""; };
modal.addEventListener("mousedown", (e) => { if (e.target === modal) closeModal(); });
const confirmBox = (title, text, yes = "Continuar", danger = false) => new Promise((resolve) => {
  openModal(`<h3>${esc(title)}</h3><p>${text}</p><div class="modal-actions"><button class="btn" data-n>Cancelar</button><button class="btn ${danger ? "danger solid" : "primary"}" data-y>${esc(yes)}</button></div>`);
  box.querySelector("[data-y]").onclick = () => { closeModal(); resolve(true); };
  box.querySelector("[data-n]").onclick = () => { closeModal(); resolve(false); };
});
const ask = (title, label, value = "") => new Promise((resolve) => {
  openModal(`<h3>${esc(title)}</h3><label class="field"><span>${esc(label)}</span><input id="askIn" maxlength="80" value="${esc(value)}"></label><div class="modal-actions"><button class="btn" data-n>Cancelar</button><button class="btn primary" data-y>Salvar</button></div>`);
  const inp = $("#askIn"); inp.focus(); inp.select();
  const ok = () => { const v = inp.value.trim(); closeModal(); resolve(v); };
  box.querySelector("[data-y]").onclick = ok; inp.onkeydown = (e) => { if (e.key === "Enter") ok(); if (e.key === "Escape") { closeModal(); resolve(null); } };
  box.querySelector("[data-n]").onclick = () => { closeModal(); resolve(null); };
});
const guard = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { toast(e.message, "err"); } };
const menu = $("#menu");
function showMenu(anchor, items) {
  menu.innerHTML = items.map((it, i) => (it === "-" ? "<hr>" : `<button data-i="${i}" class="${it.danger ? "danger" : ""}"><i class="i i-${it.icon}"></i>${esc(it.label)}</button>`)).join("");
  menu.hidden = false;
  const r = anchor.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
  menu.style.left = Math.max(8, Math.min(innerWidth - mw - 8, r.right - mw)) + "px";
  menu.style.top = (r.bottom + mh + 8 > innerHeight ? Math.max(8, r.top - mh - 4) : r.bottom + 4) + "px";
  menu.onclick = (e) => { const b = e.target.closest("[data-i]"); if (!b) return; menu.hidden = true; guard(items[b.dataset.i].fn)(); };
}
document.addEventListener("mousedown", (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
// dica ao passar o mouse (gráficos e células)
const tip = $("#tip");
document.addEventListener("mouseover", (e) => { const t = e.target.closest("[data-tip]"); if (!t) { tip.hidden = true; return; } tip.innerHTML = t.dataset.tip; tip.hidden = false; });
document.addEventListener("mousemove", (e) => { if (tip.hidden) return; const w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = Math.min(innerWidth - w - 8, e.clientX + 12) + "px"; tip.style.top = (e.clientY - h - 12 < 4 ? e.clientY + 16 : e.clientY - h - 12) + "px"; });
document.addEventListener("error", (e) => { if (e.target.tagName === "IMG" && e.target.dataset.fallback !== undefined) { const g = byId(e.target.dataset.fallback); e.target.outerHTML = g ? genCover(g) : ""; } }, true);
$("#lightbox").onclick = () => ($("#lightbox").hidden = true);

// capa desenhada para jogos sem arte: cor tirada do nome + ícone do jogo
function hue(s) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; }
const genCover = (g) => `<div class="gencover" style="--h:${hue(g.name)}">${g.icon ? `<img src="${esc(g.icon)}" alt="">` : `<i class="i i-gamepad-2"></i>`}<b>${esc(g.name)}</b></div>`;
const coverHtml = (g) => (g.cover ? `<img class="cv" src="${esc(g.cover)}" data-fallback="${esc(g.id)}" loading="lazy" alt="">` : genCover(g));

// ---------------------------------------------------------------- dados
// dados novos chegam sozinhos (tamanhos, capas, partidas); a tela do sorteio não é redesenhada para não parar a roleta
piphin.on("games", (d) => { S.data = d; if (S.tab === "pick" && !S.view) refreshLive(); else render(); });
piphin.on("live", (live) => { if (S.data) { S.data.live = live; refreshLive(); if (S.tab === "library" && !S.view) render(); } });
async function load(force = false) { S.data = await call("games", force); render(); }
let liveTimer = 0;
function refreshLive() {
  const pill = $("#livePill"), live = S.data ? S.data.live : [];
  pill.hidden = !live.length;
  clearInterval(liveTimer);
  if (!live.length) return;
  const upd = () => { const l = live[0], g = byId(l.id); pill.innerHTML = `<span class="pulse"></span>Jogando <b>${esc(g ? g.name : "")}</b> · ${hm((Date.now() - l.since) / 60000)}`; pill.onclick = () => openGame(l.id); };
  upd(); liveTimer = setInterval(upd, 30000);
}

// ---------------------------------------------------------------- navegação
$$(".p-subnav [data-tab]").forEach((b) => (b.onclick = () => { S.tab = b.dataset.tab; S.view = null; render(); $("#content").scrollTop = 0; }));
function openGame(id) { S.view = id; render(); $("#content").scrollTop = 0; loadInfo(id); }
async function loadInfo(id) {
  if (S.info[id] !== undefined) return;
  S.info[id] = "loading";
  try { S.info[id] = await call("info", id); } catch { S.info[id] = null; }
  if (S.view === id) render();
}
function render() {
  $$(".p-subnav [data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === S.tab && !S.view));
  refreshLive();
  const c = $("#content");
  if (!S.data) { c.innerHTML = `<div class="loading"><span class="spin"></span><div><b>Procurando seus jogos...</b><span class="faint">Steam, Epic, Riot, GOG, Ubisoft, EA, Battle.net, Rockstar e Xbox</span></div></div>`; return; }
  const top = c.scrollTop, fid = document.activeElement && c.contains(document.activeElement) ? document.activeElement.id : "";
  c.innerHTML = S.view ? gamePage(S.view) : { library, stats, pick, space }[S.tab]();
  c.scrollTop = top;
  if (fid && $("#" + fid)) { const f = $("#" + fid); f.focus(); if (f.setSelectionRange) f.setSelectionRange(f.value.length, f.value.length); }
  bind();
}

// ---------------------------------------------------------------- biblioteca
function sorted(list) {
  const by = {
    recent: (a, b) => P(b.id).lastPlayed - P(a.id).lastPlayed || a.name.localeCompare(b.name, "pt-BR"),
    name: (a, b) => a.name.localeCompare(b.name, "pt-BR"),
    played: (a, b) => P(b.id).total - P(a.id).total,
    size: (a, b) => b.size - a.size,
    added: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  };
  return list.slice().sort((a, b) => (b.fav - a.fav) || by[S.sort](a, b));
}
function library() {
  const all = visible();
  if (!all.length) return `<div class="empty-box big"><i class="i i-gamepad-2"></i><b>Nenhum jogo encontrado</b><span>Procuramos na Steam, Epic, Riot, GOG, Ubisoft, EA, Battle.net, Rockstar e Xbox. Se o seu jogo é de outro lugar, adicione o programa dele.</span>
    <div class="row"><button class="btn primary" data-act="add"><i class="i i-plus"></i>Adicionar um jogo</button><button class="btn" data-act="rescan"><i class="i i-refresh-cw"></i>Procurar de novo</button></div></div>`;
  const counts = {}; for (const g of all) counts[g.launcher] = (counts[g.launcher] || 0) + 1;
  const q = S.q.toLowerCase();
  const list = sorted(all.filter((g) => (S.launcher === "all" || g.launcher === S.launcher) && (!S.favOnly || g.fav) && (!q || g.name.toLowerCase().includes(q))));
  const recent = all.filter((g) => P(g.id).lastPlayed).sort((a, b) => P(b.id).lastPlayed - P(a.id).lastPlayed);
  const st = S.data.stats;
  return `${recent.length ? continueHero(recent[0], recent.slice(1, 5)) : ""}
    <div class="lib-head"><h2>Seus jogos <em>${all.length}</em></h2><span class="faint">${hours(st.total)} h jogadas · ${gb(all.reduce((a, g) => a + g.size, 0))} no disco</span></div>
    <div class="toolbar">
      <div class="search"><i class="i i-search"></i><input id="q" placeholder="Procurar jogo" value="${esc(S.q)}"></div>
      <div class="chips">${[["all", "Todas", all.length], ...Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, S.data.launcherNames[k] || k, n])].map(([k, l, n]) => `<button class="chip ${S.launcher === k ? "active" : ""}" data-launcher="${k}">${esc(l)} <em>${n}</em></button>`).join("")}
        <button class="chip ${S.favOnly ? "active" : ""}" data-act="favonly"><i class="i i-star"></i>Favoritos</button></div>
      <div class="grow"></div>
      <select id="sort">${[["recent", "Jogados recentemente"], ["played", "Mais jogados"], ["name", "Nome"], ["size", "Tamanho"], ["added", "Atualizados recentemente"]].map(([k, l]) => `<option value="${k}" ${S.sort === k ? "selected" : ""}>${l}</option>`).join("")}</select>
      <button class="btn icon ghost sm" data-act="rescan" title="Procurar jogos de novo"><i class="i i-refresh-cw"></i></button>
      <button class="btn sm" data-act="add"><i class="i i-plus"></i>Adicionar jogo</button>
    </div>
    ${list.length ? `<div class="grid">${list.map(card).join("")}</div>` : `<div class="empty-box"><i class="i i-search"></i><b>Nenhum jogo com esse filtro</b></div>`}`;
}
function continueHero(g, more) {
  const p = P(g.id), live = isLive(g.id);
  return `<section class="cont" ${g.hero ? `style="--bg:url('${esc(g.hero)}')"` : `style="--h:${hue(g.name)}"`}>
    <div class="cont-in">
      <span class="kicker">${live ? `<span class="pulse"></span>Jogando agora` : "Continuar jogando"}</span>
      ${g.logo ? `<img class="logo" src="${esc(g.logo)}" alt="${esc(g.name)}" data-logo>` : ""}<h1 class="cont-name" ${g.logo ? "hidden" : ""}>${esc(g.name)}</h1>
      <p>${hm(p.total)} no total · última vez ${ago(p.lastPlayed)} · ${esc(g.launcherName)}</p>
      <div class="row"><button class="btn play big" data-play="${esc(g.id)}"><i class="i i-play"></i>${live ? "Abrir" : "Jogar"}</button><button class="btn glass" data-open="${esc(g.id)}"><i class="i i-info"></i>Detalhes</button></div>
    </div>
    ${more.length ? `<div class="cont-more">${more.map((m) => `<button class="mini" data-open="${esc(m.id)}" data-tip="<b>${esc(m.name)}</b><br>${ago(P(m.id).lastPlayed)}">${m.header ? `<img src="${esc(m.header)}" alt="" data-fallback="${esc(m.id)}">` : genCover(m)}</button>`).join("")}</div>` : ""}
  </section>`;
}
function card(g) {
  const p = P(g.id), live = isLive(g.id);
  return `<div class="card-g ${live ? "live" : ""}" data-open="${esc(g.id)}">
    <div class="cover">${coverHtml(g)}
      ${g.fav ? `<span class="fav"><i class="i i-star"></i></span>` : ""}${live ? `<span class="live-tag"><span class="pulse"></span>Jogando</span>` : ""}${g.installing ? `<span class="live-tag warn">Atualizando</span>` : ""}
      <div class="ov"><button class="playc" data-play="${esc(g.id)}" title="Jogar"><i class="i i-play"></i></button><span>${p.total ? hm(p.total) : "Ainda não jogado"}</span></div></div>
    <b>${esc(g.name)}</b><span class="sub">${esc(g.launcherName)}${p.lastPlayed ? " · " + ago(p.lastPlayed) : ""}</span></div>`;
}

// ---------------------------------------------------------------- página do jogo
function bars(values, { labels, height = 120, fmt = hm, cls = "" } = {}) {
  const max = Math.max(1, ...values);
  return `<div class="bars ${cls}" style="--h:${height}px">${values.map((v, i) => `<div class="bar" data-tip="<b>${esc(labels ? labels[i] : "")}</b><br>${v ? fmt(v) : "não jogou"}"><span style="height:${v ? Math.max(3, (v / max) * 100) : 0}%"></span></div>`).join("")}</div>`;
}
function gamePage(id) {
  const g = byId(id);
  if (!g) return `<div class="empty-box"><b>Jogo não encontrado</b><button class="btn" data-act="back">Voltar</button></div>`;
  const p = P(id), info = S.info[id], live = isLive(id);
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const labels = p.last30.map((_, i) => dateBR(now.getTime() - (29 - i) * 86400000));
  const tiles = [
    ["clock", "Tempo total", hm(p.total), g.steamMinutes && p.tracked < g.steamMinutes ? "pela Steam" : "contado aqui"],
    ["history", "Última vez", ago(p.lastPlayed), p.lastPlayed ? new Date(p.lastPlayed).toLocaleDateString("pt-BR") : ""],
    ["activity", "Sessões", p.sessions.toLocaleString("pt-BR"), p.sessions ? `média de ${hm(p.avg)}` : "contadas pelo Piphin"],
    ["trophy", "Maior sessão", p.longest ? hm(p.longest) : "—", ""],
    ["hard-drive", "No disco", gb(g.size), g.sizePending ? "calculando..." : ""],
  ];
  return `<section class="ghero" ${g.hero ? `style="--bg:url('${esc(g.hero)}')"` : `style="--h:${hue(g.name)}"`}>
      <button class="btn glass sm back" data-act="back"><i class="i i-chevron-left"></i>Voltar</button>
      <div class="ghero-in">
        ${g.logo ? `<img class="logo" src="${esc(g.logo)}" alt="${esc(g.name)}" data-logo>` : ""}<h1 class="cont-name" ${g.logo ? "hidden" : ""}>${esc(g.name)}</h1>
        <div class="row"><button class="btn play big" data-play="${esc(id)}"><i class="i i-play"></i>${live ? "Abrir" : "Jogar"}</button>
          <button class="btn glass icon ${g.fav ? "on" : ""}" data-act="fav" title="${g.fav ? "Tirar dos favoritos" : "Favoritar"}"><i class="i i-star"></i></button>
          <button class="btn glass icon" data-act="gmenu" title="Mais"><i class="i i-ellipsis-vertical"></i></button>
          ${live ? `<span class="live-tag big"><span class="pulse"></span>Jogando agora</span>` : ""}</div>
      </div></section>
    <div class="tiles">${tiles.map(([ic, l, v, s]) => `<div class="tile"><i class="i i-${ic}"></i><span>${l}</span><b>${esc(v)}</b><em>${esc(s)}</em></div>`).join("")}</div>
    <div class="two">
      <section class="panel"><h3>Últimos 30 dias</h3>
        ${p.last30.some((v) => v) ? bars(p.last30, { labels }) + `<div class="axis"><span>${labels[0]}</span><span>hoje</span></div>` : `<p class="faint">${p.tracked ? "Sem partidas nos últimos 30 dias." : "O Piphin Jogos começa a contar suas partidas a partir de agora (enquanto o Hub estiver aberto). Volte depois de jogar!"}</p>`}
      </section>
      <section class="panel"><h3>Informações</h3>
        <dl class="kv2"><dt>Loja</dt><dd>${esc(g.launcherName)}</dd>
          ${info && info !== "loading" ? `${info.developers.length ? `<dt>Desenvolvedora</dt><dd>${esc(info.developers.join(", "))}</dd>` : ""}${info.release ? `<dt>Lançamento</dt><dd>${esc(info.release)}</dd>` : ""}${info.achievements ? `<dt>Conquistas</dt><dd>${info.achievements}</dd>` : ""}${info.recommendations ? `<dt>Análises na Steam</dt><dd>${info.recommendations.toLocaleString("pt-BR")}</dd>` : ""}` : ""}
          <dt>Pasta</dt><dd class="path"><a href="#" data-act="folder">${esc(g.dir)}</a></dd></dl>
      </section>
    </div>
    ${info === "loading" ? `<section class="panel"><div class="row"><span class="spin"></span><span class="muted">Buscando informações na loja...</span></div></section>` : info ? about(info) : ""}`;
}
function about(info) {
  return `<section class="panel"><div class="about-head"><h3>Sobre o jogo</h3>${info.metacritic ? `<span class="meta ${info.metacritic.score >= 75 ? "hi" : info.metacritic.score >= 50 ? "md" : "lo"}" data-tip="Nota no Metacritic">${info.metacritic.score}</span>` : ""}</div>
    ${info.genres.length ? `<div class="chips">${info.genres.map((x) => `<span class="chip static">${esc(x)}</span>`).join("")}</div>` : ""}
    <p class="desc">${esc(info.short)}</p>
    ${info.screenshots.length ? `<div class="shots">${info.screenshots.map((s) => `<button data-shot="${esc(s.full)}"><img src="${esc(s.thumb)}" alt="" loading="lazy"></button>`).join("")}</div>` : ""}
    ${info.reqMin || info.reqRec ? `<details class="req"><summary><i class="i i-cpu"></i>Requisitos do PC</summary><div class="req-cols">${info.reqMin ? `<div><b>Mínimos</b><pre>${esc(info.reqMin)}</pre></div>` : ""}${info.reqRec ? `<div><b>Recomendados</b><pre>${esc(info.reqRec)}</pre></div>` : ""}</div></details>` : ""}
    <p class="faint">Informações da loja Steam.</p></section>`;
}
function gameMenu(anchor, g) {
  showMenu(anchor, [
    { label: "Renomear", icon: "pencil", fn: async () => { const n = await ask("Renomear jogo", "Nome", g.name); if (n !== null) await call("set", g.id, { name: n || "" }); } },
    { label: "Trocar a capa", icon: "layers-3", fn: () => call("set-cover", g.id) },
    { label: "Capa original", icon: "refresh-cw", fn: () => call("reset-cover", g.id) },
    "-",
    { label: "Abrir a pasta do jogo", icon: "folder-open", fn: () => call("open-folder", g.id) },
    ...(g.store ? [{ label: "Página na loja Steam", icon: "store", fn: () => window.open(g.store) }] : []),
    "-",
    { label: "Esconder da biblioteca", icon: "eye-off", fn: async () => { await call("set", g.id, { hidden: true }); S.view = null; toast(`${g.name} escondido. Mostre de novo em Configurações.`); } },
    ...(g.custom ? [{ label: "Tirar da biblioteca", icon: "trash-2", danger: true, fn: async () => { if (await confirmBox(`Tirar ${g.name}?`, "Só sai da lista do Piphin Jogos; nada é apagado do computador.", "Tirar", true)) { await call("remove-custom", g.id); S.view = null; render(); } } }] : []),
  ]);
}

// ---------------------------------------------------------------- estatísticas
const BADGES = [
  ["moon", "Coruja da madrugada", "Mais de 30% do tempo entre meia-noite e 5h", (s) => s.tracked >= 120 && s.byHour.slice(0, 5).reduce((a, b) => a + b, 0) / s.tracked >= 0.3],
  ["sunrise", "Madrugador", "Joga mais de manhã (5h às 12h)", (s) => s.tracked >= 120 && peak(s.byHour) >= 5 && peak(s.byHour) < 12],
  ["flame", "Em chamas", "5 dias seguidos jogando", (s) => s.bestStreak >= 5],
  ["hourglass", "Maratonista", "Uma sessão de 4 horas ou mais", (s) => s.longest && s.longest.minutes >= 240],
  ["heart", "Fiel", "Um jogo com mais de 60% do seu tempo", (s, gs) => s.total >= 300 && Math.max(...gs.map((g) => P(g.id).total)) / s.total >= 0.6],
  ["swords", "Guerreiro de fim de semana", "Metade do tempo no sábado e domingo", (s) => s.tracked >= 180 && (s.byWeekday[0] + s.byWeekday[6]) / s.tracked >= 0.5],
  ["compass", "Explorador", "5 jogos diferentes nos últimos 30 dias", (s, gs) => gs.filter((g) => P(g.id).last30.some((v) => v)).length >= 5],
  ["library", "Colecionador", "20 jogos instalados", (s, gs) => gs.length >= 20],
  ["crown", "Veterano", "500 horas jogadas no total", (s) => s.total >= 30000],
];
const peak = (arr) => arr.indexOf(Math.max(...arr));
function heatmap(heat) {
  const max = Math.max(1, ...heat.map((h) => h[1]));
  const first = new Date(heat[0][0] + "T12:00").getDay(); // a primeira coluna começa no domingo
  const cells = [...Array(first).fill(null), ...heat];
  const lvl = (m) => (!m ? 0 : m < max * 0.25 ? 1 : m < max * 0.5 ? 2 : m < max * 0.75 ? 3 : 4);
  const months = []; let lastM = -1;
  for (let i = 0; i < cells.length; i += 7) { const c = cells.slice(i, i + 7).find(Boolean); const m = c ? new Date(c[0] + "T12:00").getMonth() : lastM; months.push(m !== lastM ? new Date(2000, m, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "") : ""); lastM = m; }
  return `<div class="heat-wrap"><div class="heat-days"><span></span>${WD.map((d, i) => `<span>${i % 2 ? d : ""}</span>`).join("")}</div><div><div class="heat-months">${months.map((m) => `<span>${m}</span>`).join("")}</div>
    <div class="heat">${cells.map((c) => (c ? `<i class="l${lvl(c[1])}" data-tip="<b>${new Date(c[0] + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}</b><br>${c[1] ? hm(c[1]) : "não jogou"}"></i>` : "<i class='pad'></i>")).join("")}</div></div></div>
    <div class="heat-legend"><span>menos</span>${[0, 1, 2, 3, 4].map((l) => `<i class="l${l}"></i>`).join("")}<span>mais</span></div>`;
}
function stats() {
  const s = S.data.stats, gs = visible();
  const top = gs.map((g) => [g, P(g.id).total]).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxTop = top.length ? top[0][1] : 1;
  const delta = s.lastWeek ? Math.round(((s.thisWeek - s.lastWeek) / s.lastWeek) * 100) : null;
  const launch = Object.entries(s.launchers).filter(([, m]) => m > 0).sort((a, b) => b[1] - a[1]), maxL = launch.length ? launch[0][1] : 1;
  const earned = BADGES.filter((b) => b[3](s, gs));
  const noTrack = !s.tracked;
  return `<div class="hero-nums">
      <div class="hn big"><span>Tempo total de jogo</span><b>${hours(s.total)}<small> h</small></b><em>${top.length ? `${Math.round((top[0][1] / Math.max(1, s.total)) * 100)}% em ${esc(top[0][0].name)}` : "Jogue algo para começar"}</em></div>
      <div class="hn"><span>Esta semana</span><b>${hm(s.thisWeek)}</b><em>${delta == null ? "semana passada: " + hm(s.lastWeek) : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta)}% que a semana passada`}</em></div>
      <div class="hn"><span>Sequência</span><b>${s.streak} ${s.streak === 1 ? "dia" : "dias"}</b><em>recorde: ${s.bestStreak} ${s.bestStreak === 1 ? "dia" : "dias"}</em></div>
      <div class="hn"><span>Jogos instalados</span><b>${gs.length}</b><em>${gb(gs.reduce((a, g) => a + g.size, 0))} no disco</em></div>
    </div>
    ${noTrack ? `<div class="banner info"><i class="i i-info"></i><div><b>A contagem começou agora.</b> O tempo total vem da Steam; daqui em diante o Piphin Jogos conta as partidas de <b>qualquer loja</b> enquanto o Hub estiver aberto, e os gráficos de dias e horários vão se enchendo.${S.data.prefs.keepAlive ? "" : ` <a href="#" data-act="settings">Continuar contando com a janela fechada</a>.`}</div></div>` : ""}
    <section class="panel"><div class="ph"><h3>Seus dias de jogo</h3><span class="faint">últimos 6 meses · ${s.daysPlayed} ${s.daysPlayed === 1 ? "dia" : "dias"} com partidas</span></div>${heatmap(s.heat)}</section>
    <div class="two">
      <section class="panel"><h3>Mais jogados</h3>${top.length ? `<div class="hbars">${top.map(([g, m]) => `<button class="hb" data-open="${esc(g.id)}" data-tip="<b>${esc(g.name)}</b><br>${hm(m)}"><span class="hb-name">${esc(g.name)}</span><span class="hb-track"><span style="width:${(m / maxTop) * 100}%"></span></span><span class="hb-val">${hours(m)} h</span></button>`).join("")}</div>` : `<p class="faint">Nenhum tempo de jogo ainda.</p>`}</section>
      <section class="panel"><h3>Seu perfil de jogador</h3><div class="badges">${BADGES.map(([ic, n, d, f]) => { const ok = earned.some((e) => e[1] === n); return `<div class="badge-g ${ok ? "ok" : ""}" data-tip="${esc(d)}${ok ? "" : "<br><em>ainda não conquistado</em>"}"><i class="i i-${ic}"></i><span>${esc(n)}</span></div>`; }).join("")}</div>
        <p class="faint">${earned.length} de ${BADGES.length} conquistados</p></section>
    </div>
    <div class="two">
      <section class="panel"><div class="ph"><h3>A que horas você joga</h3>${s.tracked ? `<span class="faint">pico às ${peak(s.byHour)}h</span>` : ""}</div>${s.tracked ? bars(s.byHour, { labels: s.byHour.map((_, h) => `${h}h às ${h + 1}h`), height: 110 }) + `<div class="axis"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>` : `<p class="faint">Aparece depois das primeiras partidas contadas.</p>`}</section>
      <section class="panel"><div class="ph"><h3>Dias da semana</h3>${s.tracked ? `<span class="faint">mais aos ${["domingos", "segundas", "terças", "quartas", "quintas", "sextas", "sábados"][peak(s.byWeekday)]}</span>` : ""}</div>${s.tracked ? bars(s.byWeekday, { labels: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"], height: 110, cls: "wide" }) + `<div class="axis wd">${WD.map((d) => `<span>${d}</span>`).join("")}</div>` : `<p class="faint">Aparece depois das primeiras partidas contadas.</p>`}</section>
    </div>
    <div class="two">
      <section class="panel"><h3>Tempo por loja</h3>${launch.length ? `<div class="hbars">${launch.map(([k, m]) => `<div class="hb" data-tip="<b>${esc(S.data.launcherNames[k] || k)}</b><br>${hm(m)}"><span class="hb-name">${esc(S.data.launcherNames[k] || k)}</span><span class="hb-track"><span style="width:${(m / maxL) * 100}%"></span></span><span class="hb-val">${hours(m)} h</span></div>`).join("")}</div>` : `<p class="faint">Nenhum tempo ainda.</p>`}</section>
      <section class="panel"><h3>Recordes</h3><dl class="kv2">
        <dt>Maior sessão</dt><dd>${s.longest ? `${hm(s.longest.minutes)} de ${esc((byId(s.longest.id) || {}).name || "?")} (${new Date(s.longest.at).toLocaleDateString("pt-BR")})` : "—"}</dd>
        <dt>Partidas contadas</dt><dd>${s.sessions.toLocaleString("pt-BR")}</dd>
        <dt>Contando desde</dt><dd>${s.firstTracked ? new Date(s.firstTracked).toLocaleDateString("pt-BR") : "agora"}</dd>
        <dt>Jogo esquecido</dt><dd>${(() => { const f = gs.filter((g) => P(g.id).lastPlayed).sort((a, b) => P(a.id).lastPlayed - P(b.id).lastPlayed)[0]; return f ? `${esc(f.name)}, ${ago(P(f.id).lastPlayed)}` : "—"; })()}</dd></dl></section>
    </div>`;
}

// ---------------------------------------------------------------- o que jogar? (sorteio)
function candidates() {
  let list = visible();
  if (S.pickOpts.fav) list = list.filter((g) => g.fav);
  if (S.pickOpts.stale) list = list.filter((g) => !P(g.id).lastPlayed || Date.now() - P(g.id).lastPlayed > 14 * 86400000);
  return list;
}
function pick() {
  const list = candidates();
  return `<section class="pick">
    <h1>Não sabe o que jogar?</h1><p class="muted">Deixa a sorte escolher entre os seus jogos instalados.</p>
    <div class="pick-opts"><label class="swl"><span class="switch"><input type="checkbox" id="optStale" ${S.pickOpts.stale ? "checked" : ""}><span></span></span>Só os que não jogo há 2 semanas</label>
      <label class="swl"><span class="switch"><input type="checkbox" id="optFav" ${S.pickOpts.fav ? "checked" : ""}><span></span></span>Só os favoritos</label></div>
    <div class="reel-win"><div class="reel" id="reel">${list.length ? list.slice(0, 7).map((g) => `<div class="rc">${coverHtml(g)}</div>`).join("") : ""}</div><div class="reel-mark"></div></div>
    ${list.length ? `<button class="btn play big" id="spin" ${list.length < 2 ? "disabled" : ""}><i class="i i-dices"></i>Sortear</button>` : `<p class="faint">Nenhum jogo com essas opções.</p>`}
    <div id="pickResult"></div></section>`;
}
async function spin() {
  const list = candidates(); if (list.length < 2 || S.picking) return;
  S.picking = true; $("#spin").disabled = true; $("#pickResult").innerHTML = "";
  // os menos jogados recentemente têm mais chance
  const w = list.map((g) => { const d = P(g.id).lastPlayed ? (Date.now() - P(g.id).lastPlayed) / 86400000 : 60; return 1 + Math.min(60, d); });
  let r = Math.random() * w.reduce((a, b) => a + b, 0), win = list[0];
  for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) { win = list[i]; break; } }
  const strip = []; for (let i = 0; i < 34; i++) strip.push(list[Math.floor(Math.random() * list.length)]);
  strip.push(win, list[Math.floor(Math.random() * list.length)], list[Math.floor(Math.random() * list.length)]);
  const reel = $("#reel");
  reel.style.transition = "none"; reel.style.transform = "translateX(0)";
  reel.innerHTML = strip.map((g) => `<div class="rc">${coverHtml(g)}</div>`).join("");
  const cw = reel.firstElementChild.getBoundingClientRect().width + 14, winW = $(".reel-win").clientWidth;
  const target = 7 + 34 * cw + (cw - 14) / 2 - winW / 2; // centro do cartão vencedor embaixo do marcador
  reel.offsetWidth; // aplica a posição inicial antes de animar
  reel.style.transition = "transform 4.2s cubic-bezier(.12,.75,.12,1)";
  reel.style.transform = `translateX(${-target}px)`;
  await new Promise((res) => setTimeout(res, 4300));
  reel.children[34].classList.add("win");
  const p = P(win.id);
  $("#pickResult").innerHTML = `<div class="result"><b>${esc(win.name)}</b><span>${p.lastPlayed ? `Última vez: ${ago(p.lastPlayed)}` : "Você ainda não jogou este!"} · ${hm(p.total)} no total</span>
    <div class="row"><button class="btn play" data-play="${esc(win.id)}"><i class="i i-play"></i>Jogar agora</button><button class="btn" data-open="${esc(win.id)}">Ver o jogo</button></div></div>`;
  S.picking = false; $("#spin").disabled = false; $("#spin").innerHTML = `<i class="i i-dices"></i>Sortear de novo`;
}

// ---------------------------------------------------------------- espaço em disco
function space() {
  const gs = visible().slice().sort((a, b) => b.size - a.size), totalB = gs.reduce((a, g) => a + g.size, 0), max = gs.length ? Math.max(1, gs[0].size) : 1;
  const stale = gs.filter((g) => g.size > 5e9 && (!P(g.id).lastPlayed || Date.now() - P(g.id).lastPlayed > 90 * 86400000));
  const staleB = stale.reduce((a, g) => a + g.size, 0);
  return `<div class="hero-nums">
      <div class="hn big"><span>Espaço usado pelos jogos</span><b>${gb(totalB)}</b><em>${gs.length} jogos instalados</em></div>
      <div class="hn"><span>Parados há 3 meses ou mais</span><b>${gb(staleB)}</b><em>${stale.length ? `${stale.length} ${stale.length === 1 ? "jogo grande" : "jogos grandes"} que você não abre` : "Tudo em uso, boa!"}</em></div>
    </div>
    ${stale.length ? `<div class="banner warn"><i class="i i-hard-drive"></i><div>Precisando de espaço? Os jogos marcados com <span class="tag-stale">parado</span> estão ocupando <b>${gb(staleB)}</b> e não são abertos há mais de 3 meses. Dá para desinstalar pela loja e baixar de novo quando quiser.</div></div>` : ""}
    <section class="panel"><div class="space-list">${gs.map((g) => {
      const p = P(g.id), st = stale.includes(g);
      return `<div class="sp" data-open="${esc(g.id)}"><div class="sp-cover">${g.header ? `<img src="${esc(g.header)}" alt="" data-fallback="${esc(g.id)}">` : genCover(g)}</div>
        <div class="sp-main"><div class="sp-top"><b>${esc(g.name)}</b>${st ? `<span class="tag-stale">parado</span>` : ""}<span class="grow"></span><span class="sp-size">${g.sizePending ? `<span class="spin sm"></span>` : gb(g.size)}</span></div>
          <div class="sp-bar" data-tip="${(g.size / Math.max(1, totalB) * 100).toFixed(1)}% do espaço dos jogos"><span style="width:${(g.size / max) * 100}%"></span></div>
          <span class="faint">${esc(g.launcherName)} · última vez ${ago(p.lastPlayed)}${p.total ? ` · ${hm(p.total)} jogadas` : ""}</span></div>
        ${g.steamAppId ? `<button class="btn sm ghost" data-uninstall="${esc(g.id)}" title="A Steam pergunta antes de desinstalar"><i class="i i-trash-2"></i>Desinstalar</button>` : `<button class="btn sm ghost" data-folder="${esc(g.id)}"><i class="i i-folder-open"></i>Pasta</button>`}</div>`;
    }).join("")}</div></section>`;
}

// ---------------------------------------------------------------- configurações
async function settings() {
  const p = await call("prefs");
  const hidden = G().filter((g) => g.hidden);
  openModal(`<h3>Configurações</h3><div class="set-list">
    <label class="swl row-set"><span class="switch"><input type="checkbox" id="sKeep" ${p.keepAlive ? "checked" : ""}><span></span></span><div><b>Contar com a janela fechada</b><span>Ao fechar a janela, o Hub fica perto do relógio e continua contando o tempo de jogo.</span></div></label>
    <label class="swl row-set"><span class="switch"><input type="checkbox" id="sBoot" ${p.startWithWindows ? "checked" : ""}><span></span></span><div><b>Abrir o Hub com o Windows</b><span>Para não perder nenhuma partida.</span></div></label>
    <label class="swl row-set"><span class="switch"><input type="checkbox" id="sNotify" ${p.notify ? "checked" : ""}><span></span></span><div><b>Resumo ao terminar de jogar</b><span>Uma notificação com o tempo da partida (a partir de 10 minutos).</span></div></label>
    ${hidden.length ? `<div class="hidden-list"><b>Jogos escondidos</b>${hidden.map((g) => `<div class="hl"><span>${esc(g.name)}</span><button class="btn sm" data-unhide="${esc(g.id)}"><i class="i i-eye"></i>Mostrar</button></div>`).join("")}</div>` : ""}
    </div><div class="modal-actions"><button class="btn primary" data-y>Pronto</button></div>`);
  $("#sKeep").onchange = guard((e) => call("prefs", { keepAlive: e.target.checked }));
  $("#sBoot").onchange = guard((e) => call("prefs", { startWithWindows: e.target.checked }));
  $("#sNotify").onchange = guard((e) => call("prefs", { notify: e.target.checked }));
  $$("[data-unhide]", box).forEach((b) => (b.onclick = guard(async () => { await call("set", b.dataset.unhide, { hidden: false }); b.closest(".hl").remove(); })));
  box.querySelector("[data-y]").onclick = closeModal;
}
$("#settingsBtn").onclick = guard(settings);

// ---------------------------------------------------------------- cliques
function bind() {
  const q = $("#q"); if (q) q.oninput = () => { S.q = q.value; render(); };
  const so = $("#sort"); if (so) so.onchange = () => { S.sort = so.value; render(); };
  $$("[data-launcher]").forEach((b) => (b.onclick = () => { S.launcher = b.dataset.launcher; render(); }));
  const os = $("#optStale"); if (os) os.onchange = () => { S.pickOpts.stale = os.checked; render(); };
  const of = $("#optFav"); if (of) of.onchange = () => { S.pickOpts.fav = of.checked; render(); };
  const sp = $("#spin"); if (sp) sp.onclick = guard(spin);
  // logo que não carregou: mostra o nome
  $$("img[data-logo]").forEach((im) => (im.onerror = () => { im.remove(); const n = $(".cont-name[hidden]"); if (n) n.hidden = false; }));
}
$("#content").addEventListener("click", guard(async (e) => {
  const t = e.target.closest("[data-play], [data-open], [data-act], [data-shot], [data-uninstall], [data-folder]"); if (!t) return;
  if (t.tagName === "A") e.preventDefault();
  if (t.dataset.play) { e.stopPropagation(); const g = byId(t.dataset.play); await call("launch", g.id); toast(`Abrindo ${g.name}...`, "ok"); return; }
  if (t.dataset.shot) { $("#lbImg").src = t.dataset.shot; $("#lightbox").hidden = false; return; }
  if (t.dataset.uninstall) { const g = byId(t.dataset.uninstall); if (await confirmBox(`Desinstalar ${g.name}?`, "A Steam vai abrir e confirmar antes de apagar. Seu tempo de jogo e conquistas ficam guardados na sua conta.", "Abrir na Steam")) await call("uninstall", g.id); return; }
  if (t.dataset.folder) { e.stopPropagation(); return call("open-folder", t.dataset.folder); }
  if (t.dataset.open) return openGame(t.dataset.open);
  const g = S.view && byId(S.view);
  switch (t.dataset.act) {
    case "back": S.view = null; return render();
    case "add": { const id = await call("add-game"); if (id) { toast("Jogo adicionado", "ok"); openGame(id); } return; }
    case "rescan": toast("Procurando jogos..."); await load(true); return toast(`${visible().length} jogos encontrados`, "ok");
    case "favonly": S.favOnly = !S.favOnly; return render();
    case "fav": return call("set", g.id, { fav: !g.fav });
    case "gmenu": return gameMenu(t, g);
    case "folder": return call("open-folder", g.id);
    case "settings": return settings();
  }
}));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { if (!$("#lightbox").hidden) $("#lightbox").hidden = true; else if (!modal.hidden) closeModal(); else if (S.view) { S.view = null; render(); } }
  if (e.ctrlKey && e.key.toLowerCase() === "f") { e.preventDefault(); if (S.tab !== "library" || S.view) { S.tab = "library"; S.view = null; render(); } $("#q") && $("#q").focus(); }
});

render();
load().catch((e) => { $("#content").innerHTML = `<div class="empty-box"><i class="i i-triangle-alert"></i><b>Não deu para ler seus jogos</b><span>${esc(e.message)}</span></div>`; });
