// Piphin Jogos como módulo do Piphin Hub: todos os jogos instalados no PC (Steam, Epic, Riot, GOG, Ubisoft, EA, Battle.net,
// Rockstar, Xbox e os que a pessoa adicionar), com o tempo de jogo contado e estatísticas.
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const sys = require("./sys");
const launchers = require("./launchers");
const { createStore } = require("./store");
const { createTracker } = require("./tracker");
const { compute } = require("./stats");

const MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", ico: "image/x-icon", gif: "image/gif", bmp: "image/bmp" };
const NAMES = { steam: "Steam", epic: "Epic Games", riot: "Riot Games", gog: "GOG", ubisoft: "Ubisoft", xbox: "Xbox", ea: "EA", battlenet: "Battle.net", rockstar: "Rockstar", other: "Outros", custom: "Adicionados por você" };

exports.activate = (ctx) => {
  fs.mkdirSync(ctx.dataDir, { recursive: true });
  const PREFS = path.join(ctx.dataDir, "prefs.json"), SIZES = path.join(ctx.dataDir, "tamanhos.json"), ICONS = path.join(ctx.dataDir, "icones");
  const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
  let prefs = { games: {}, custom: [], notify: true, keepAlive: false, ...readJson(PREFS, {}) };
  const savePrefs = () => fs.writeFileSync(PREFS, JSON.stringify(prefs, null, 1));
  let sizes = readJson(SIZES, {});
  const store = createStore(ctx.dataDir);
  const uid = () => crypto.randomBytes(5).toString("hex");

  // ---------------------------------------------------------------- servidor local para as capas que estão no disco
  const token = crypto.randomBytes(16).toString("hex");
  const files = new Map(), byFile = new Map(); let seq = 0, base = "";
  const server = http.createServer((req, res) => {
    const m = /^\/a\/([0-9a-f]+)\/(\d+)/.exec(req.url || "");
    const file = m && m[1] === token ? files.get(Number(m[2])) : null;
    if (!file) { res.writeHead(404); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file).slice(1).toLowerCase()] || "application/octet-stream", "Cache-Control": "max-age=3600", "Access-Control-Allow-Origin": "*" });
      res.end(buf);
    });
  });
  const ready = new Promise((r) => server.listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}/a/${token}`; r(); }));
  ctx.onStop(() => server.close());
  const url = (v) => {
    if (!v) return null;
    if (/^https?:/.test(v)) return v;
    if (!fs.existsSync(v)) return null;
    let id = byFile.get(v); if (!id) { id = ++seq; files.set(id, v); byFile.set(v, id); }
    return `${base}/${id}/${encodeURIComponent(path.basename(v))}`;
  };

  // ---------------------------------------------------------------- jogos
  let games = [], scanning = null, lastScan = 0;
  const tracker = createTracker({
    dataDir: ctx.dataDir,
    onStart: (id) => { const g = games.find((x) => x.id === id); ctx.emit("live", tracker.now()); if (g) ctx.log("jogando", g.name); },
    onEnd: (ses) => {
      ctx.emit("live", tracker.now()); pushGames();
      const g = games.find((x) => x.id === ses.g), min = Math.round((ses.e - ses.s) / 60000);
      if (g && prefs.notify && min >= 10) ctx.host.notify("Piphin Jogos", `Você jogou ${fmtMin(min)} de ${displayName(g)}.`).catch(() => {});
    },
  });
  const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
  const displayName = (g) => (prefs.games[g.id] && prefs.games[g.id].name) || g.name;

  async function scan() {
    if (scanning) return scanning;
    scanning = (async () => {
      const custom = prefs.custom.map((c) => ({ ...c, launcher: "custom", art: { icon: c.launch && c.launch.exe } }));
      const r = await launchers.scanAll(custom);
      games = r.games;
      lastScan = Date.now();
      tracker.setGames(games);
      pushGames();
      enrich(); // tamanhos, ícones e capas da loja em segundo plano
      return games;
    })();
    try { return await scanning; } finally { scanning = null; }
  }
  function publicGame(g) {
    const o = prefs.games[g.id] || {};
    const artId = g.steamAppId || (o.artAppId !== undefined ? o.artAppId : g.artAppId) || null;
    const cdn = (n) => (artId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${artId}/${n}` : null);
    const sz = g.size || (sizes[g.dir] && sizes[g.dir].size) || 0;
    return {
      id: g.id, launcher: g.launcher, launcherName: NAMES[g.launcher] || g.launcher, name: o.name || g.name, originalName: g.name, dir: g.dir, size: sz, sizePending: !sz,
      steamAppId: g.steamAppId || null, artAppId: artId, store: g.store || (artId ? `https://store.steampowered.com/app/${artId}` : null), installing: !!g.installing,
      cover: url(o.cover) || url(g.art.cover) || cdn("library_600x900.jpg"), hero: url(g.art.hero) || cdn("library_hero.jpg"), logo: url(g.art.logo) || cdn("logo.png"),
      header: url(g.art.header) || cdn("header.jpg"), icon: url(o.iconFile) || (g.art.icon && /\.(ico|png|jpg)$/i.test(g.art.icon) ? url(g.art.icon) : null),
      fav: !!o.fav, hidden: !!o.hidden, custom: g.launcher === "custom", updatedAt: g.updatedAt || 0, lastPlayed: g.lastPlayed || 0, steamMinutes: g.steamMinutes || 0,
    };
  }
  function snapshot() {
    const pub = games.map(publicGame);
    const st = compute(games, tracker.sessions());
    return { games: pub, stats: st, live: tracker.now(), prefs: { notify: prefs.notify, keepAlive: prefs.keepAlive }, scannedAt: lastScan, launcherNames: NAMES };
  }
  let pushT = 0; const pushGames = () => { clearTimeout(pushT); pushT = setTimeout(() => ctx.emit("games", snapshot()), 150); };

  let enriching = false;
  async function enrich() {
    if (enriching) return; enriching = true;
    try {
      // capa da loja Steam para jogos de outras lojas (mesmo nome)
      for (const g of games) {
        if (g.steamAppId || g.launcher === "custom" && prefs.games[g.id] && prefs.games[g.id].cover) continue;
        const o = prefs.games[g.id] || {};
        if (o.artAppId !== undefined) continue;
        const id = await store.match(g.name).catch(() => null);
        if (id) { g.artAppId = id; pushGames(); }
      }
      // ícone do .exe (para a capa desenhada dos jogos sem arte)
      const need = games.filter((g) => g.art.icon && /\.exe$/i.test(g.art.icon) && !(prefs.games[g.id] || {}).iconFile && fs.existsSync(g.art.icon));
      if (need.length) {
        fs.mkdirSync(ICONS, { recursive: true });
        const list = need.map((g) => `'${g.art.icon.replace(/'/g, "''")}'`).join(",");
        const rows = await sys.psJson(`Add-Type -AssemblyName System.Drawing; foreach ($f in @(${list})) { try { $i = [System.Drawing.Icon]::ExtractAssociatedIcon($f); $b = $i.ToBitmap(); $ms = New-Object IO.MemoryStream; $b.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); [pscustomobject]@{ f = $f; b = [Convert]::ToBase64String($ms.ToArray()) } } catch {} }`).catch(() => []);
        for (const r of rows || []) {
          const g = need.find((x) => x.art.icon === r.f); if (!g || !r.b) continue;
          const file = path.join(ICONS, crypto.createHash("md5").update(g.id).digest("hex").slice(0, 12) + ".png");
          fs.writeFileSync(file, Buffer.from(r.b, "base64"));
          (prefs.games[g.id] = prefs.games[g.id] || {}).iconFile = file;
        }
        savePrefs(); pushGames();
      }
      // tamanho das pastas que a loja não informa (guardado por 7 dias)
      for (const g of games) {
        if (g.size) continue;
        const c = sizes[g.dir];
        if (c && Date.now() - c.at < 7 * 86400000) continue;
        const size = await sys.dirSize(g.dir, Date.now() + 120000);
        sizes[g.dir] = { size, at: Date.now() }; fs.writeFileSync(SIZES, JSON.stringify(sizes)); pushGames();
      }
    } finally { enriching = false; }
  }

  function launch(g) {
    const L = g.launch || {};
    if (L.url) spawn(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "rundll32.exe"), ["url.dll,FileProtocolHandler", L.url], { detached: true, stdio: "ignore" }).unref();
    else if (L.exe) {
      if (!fs.existsSync(L.exe)) throw new Error("O programa do jogo não foi encontrado. Ele foi desinstalado ou mudou de pasta?");
      spawn(L.exe, L.args || [], { cwd: L.cwd || path.dirname(L.exe), detached: true, stdio: "ignore" }).unref();
    } else if (L.folder) ctx.host.openPath(L.folder);
    else throw new Error("Não sei como abrir este jogo");
    ctx.log("abrindo", g.name);
    return true;
  }
  const find = (id) => { const g = games.find((x) => x.id === id); if (!g) throw new Error("Jogo não encontrado (foi desinstalado?)"); return g; };

  // ---------------------------------------------------------------- chamadas da tela
  ctx.handle("games", async (force) => { await ready; if (force || !games.length || Date.now() - lastScan > 5 * 60000) await scan(); return snapshot(); });
  ctx.handle("launch", (id) => { launch(find(id)); return true; });
  ctx.handle("info", async (id) => {
    const g = find(id), p = publicGame(g);
    const appid = p.steamAppId || p.artAppId;
    return appid ? store.info(appid) : null;
  });
  ctx.handle("set", (id, patch) => {
    const o = (prefs.games[id] = prefs.games[id] || {});
    for (const k of ["name", "fav", "hidden"]) if (k in patch) o[k] = patch[k] === "" ? undefined : patch[k];
    if ("artAppId" in patch) { o.artAppId = patch.artAppId; const g = games.find((x) => x.id === id); if (g) delete g.artAppId; }
    savePrefs(); pushGames(); return true;
  });
  ctx.handle("set-cover", async (id) => {
    const list = await ctx.host.openDialog({ title: "Escolha uma imagem para a capa (de preferência em pé)", properties: ["openFile"], filters: [{ name: "Imagens", extensions: ["jpg", "jpeg", "png", "webp"] }] });
    if (!list || !list[0]) return false;
    (prefs.games[id] = prefs.games[id] || {}).cover = list[0]; savePrefs(); pushGames(); return true;
  });
  ctx.handle("reset-cover", (id) => { const o = prefs.games[id]; if (o) { delete o.cover; delete o.artAppId; } savePrefs(); pushGames(); enrich(); return true; });
  ctx.handle("add-game", async () => {
    const list = await ctx.host.openDialog({ title: "Escolha o programa (.exe) do jogo", properties: ["openFile"], filters: [{ name: "Programas", extensions: ["exe", "lnk", "bat"] }] });
    if (!list || !list[0]) return null;
    const exe = list[0], dir = path.dirname(exe);
    if (dir.split(/[\\/]/).filter(Boolean).length < 2) throw new Error("Escolha o programa dentro da pasta do jogo (não direto na raiz do disco).");
    const c = { id: "custom:" + uid(), name: path.basename(exe).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "), dir, size: 0, launch: { exe, cwd: dir } };
    prefs.custom.push(c); savePrefs(); await scan(); return c.id;
  });
  ctx.handle("remove-custom", async (id) => { prefs.custom = prefs.custom.filter((c) => c.id !== id); delete prefs.games[id]; savePrefs(); await scan(); return true; });
  ctx.handle("open-folder", (id) => ctx.host.openPath(find(id).dir));
  // desinstalar só pela própria Steam (ela pergunta antes de apagar)
  ctx.handle("uninstall", (id) => { const g = find(id); if (!g.steamAppId) throw new Error("Desinstale este jogo pela loja dele"); launch({ ...g, launch: { url: `steam://uninstall/${g.steamAppId}` } }); return true; });
  ctx.handle("prefs", async (patch = {}) => {
    if ("notify" in patch) prefs.notify = !!patch.notify;
    if ("keepAlive" in patch) { prefs.keepAlive = !!patch.keepAlive; await ctx.host.keepAlive(prefs.keepAlive, "contando o tempo de jogo").catch(() => {}); }
    if ("startWithWindows" in patch) await ctx.host.setStartWithWindows(!!patch.startWithWindows).catch(() => {});
    savePrefs();
    const sw = await ctx.host.getStartWithWindows().catch(() => null);
    return { notify: prefs.notify, keepAlive: prefs.keepAlive, startWithWindows: !!sw };
  });

  // começa a contar assim que o Hub abre (o Hub inicia os módulos junto com ele)
  if (prefs.keepAlive) ctx.host.keepAlive(true, "contando o tempo de jogo").catch(() => {});
  scan().then(() => tracker.start()).catch((e) => { ctx.log("scan", e.message); tracker.start(); });
  setInterval(() => { if (Date.now() - lastScan > 30 * 60000) scan().catch(() => {}); }, 10 * 60000).unref();
  ctx.onStop(() => tracker.stop());

  // ---------------------------------------------------------------- outros módulos (pelo servidor de ferramentas do Hub)
  // O InfoHardware mede FPS e temperaturas de cada partida; aqui só pedimos o resumo dele.
  function callTool(name, args = {}) {
    const u = process.env.PIPHIN_TOOLS_URL;
    if (!u) return Promise.reject(Object.assign(new Error("Hub antigo (precisa do 1.5.0)"), { code: "NOHUB" }));
    const body = JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method: "tools/call", params: { name, arguments: args } }), url = new URL(u);
    return new Promise((resolve, reject) => {
      const req = http.request({ host: url.hostname, port: url.port, path: url.pathname, method: "POST", timeout: 20000, headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } }, (res) => {
        let t = ""; res.setEncoding("utf8"); res.on("data", (d) => (t += d));
        res.on("end", () => {
          try {
            const j = JSON.parse(t);
            if (j.error) return reject(Object.assign(new Error(j.error.message), { code: /desconhecida/i.test(j.error.message) ? "MISSING" : "RPC" }));
            const text = j.result.content[0].text;
            if (j.result.isError) return reject(Object.assign(new Error(text), { code: /desconhecida/i.test(text) ? "MISSING" : "TOOL" }));
            resolve(JSON.parse(text));
          } catch (e) { reject(e); }
        });
      });
      req.on("timeout", () => req.destroy(new Error("O InfoHardware não respondeu")));
      req.on("error", reject); req.end(body);
    });
  }
  ctx.handle("perf", async (id) => {
    const g = find(id);
    try { return { ok: true, ...(await callTool("infohardware_game_performance", { game_id: g.id, name: displayName(g) })) }; }
    catch (e) { return { ok: false, missing: e.code === "MISSING" || e.code === "NOHUB", error: e.message }; }
  });

  // ---------------------------------------------------------------- ferramentas para a IA (module.json "tools")
  const h = (m) => +(m / 60).toFixed(1);
  const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : null);
  const byName = (q) => {
    const s = String(q || "").toLowerCase().trim();
    const pub = games.map(publicGame).filter((g) => !g.hidden);
    return pub.find((g) => g.name.toLowerCase() === s) || pub.find((g) => g.name.toLowerCase().includes(s)) || pub.find((g) => s.includes(g.name.toLowerCase()));
  };
  ctx.handle("tool:list_games", async () => {
    if (!games.length) await scan();
    const { games: pub, stats, live } = snapshot();
    return {
      games: pub.filter((g) => !g.hidden).map((g) => { const p = stats.perGame[g.id]; return { name: g.name, store: g.launcherName, hours_total: h(p.total), hours_counted_by_piphin: h(p.tracked), last_played: day(p.lastPlayed), size_gb: +(g.size / 1e9).toFixed(1), favorite: g.fav || undefined }; })
        .sort((a, b) => b.hours_total - a.hours_total),
      playing_now: live.map((l) => displayName(find(l.id))),
      note: "hours_total usa o maior entre o tempo da Steam e o contado pelo Piphin Jogos (que conta jogos de qualquer loja enquanto o Hub está aberto).",
    };
  });
  ctx.handle("tool:gaming_stats", async () => {
    if (!games.length) await scan();
    const { games: pub, stats } = snapshot();
    const name = (id) => (pub.find((g) => g.id === id) || {}).name;
    const peak = stats.byHour.indexOf(Math.max(...stats.byHour)), wd = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
    const top = Object.entries(stats.perGame).sort((a, b) => b[1].total - a[1].total).slice(0, 5).map(([id, p]) => ({ game: name(id), hours: h(p.total), sessions: p.sessions }));
    return { installed_games: pub.length, disk_gb: +(pub.reduce((a, g) => a + g.size, 0) / 1e9).toFixed(1), hours_total: h(stats.total), hours_counted_by_piphin: h(stats.tracked), counting_since: day(stats.firstTracked),
      this_week_hours: h(stats.thisWeek), last_week_hours: h(stats.lastWeek), days_played: stats.daysPlayed, streak_days: stats.streak, best_streak_days: stats.bestStreak,
      favorite_hour: stats.tracked ? `${peak}h` : null, favorite_weekday: stats.tracked ? wd[stats.byWeekday.indexOf(Math.max(...stats.byWeekday))] : null,
      longest_session: stats.longest && { game: name(stats.longest.id), hours: h(stats.longest.minutes), date: day(stats.longest.at) }, top_games: top };
  });
  // o que está sendo jogado agora (o InfoHardware usa para ligar o overlay e medir o desempenho de cada jogo)
  ctx.handle("tool:now_playing", async () => {
    if (!games.length) await scan();
    return { playing: tracker.now().map((l) => { const g = games.find((x) => x.id === l.id); return { game_id: l.id, name: g ? displayName(g) : l.id, store: g ? NAMES[g.launcher] : "", since: new Date(l.since).toISOString(), minutes: Math.round((Date.now() - l.since) / 60000), exes: l.exes }; }),
      note: "Atualizado a cada 15 segundos enquanto o Piphin Hub está aberto." };
  });
  ctx.handle("tool:launch_game", async (a = {}) => {
    if (!games.length) await scan();
    const g = byName(a.name);
    if (!g) throw new Error(`Não achei "${a.name}" entre os jogos instalados. Use list_games para ver os nomes.`);
    const r = await ctx.host.messageBox({ message: `A IA quer abrir ${g.name}`, detail: `Pela ${g.launcherName}. Abrir agora?`, buttons: ["Abrir", "Cancelar"] });
    if (r !== 0) return { opened: false, reason: "A pessoa não quis abrir agora." };
    launch(find(g.id));
    return { opened: true, game: g.name, store: g.launcherName };
  });
};
