// Piphin Jogos · encontra os jogos instalados em cada loja/launcher (só leitura: arquivos e registro).
// Cada jogo: { id, launcher, name, dir, size, launch, steamAppId, lastPlayed, steamMinutes, updatedAt, art: { cover, hero, logo, header, icon } }
const fs = require("fs");
const path = require("path");
const sys = require("./sys");

const exists = (p) => { try { return !!p && fs.existsSync(p); } catch { return false; } };
const mtime = (p) => { try { return fs.statSync(p).mtimeMs; } catch { return 0; } };
const norm = (p) => path.resolve(String(p || "")).replace(/[\\/]+$/, "").toLowerCase();

// ---------------------------------------------------------------- VDF (formato de texto da Steam)
function vdf(text) {
  const root = {}, stack = [root];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])/g;
  let m, key = null;
  while ((m = re.exec(text))) {
    if (m[2] === "{") { const o = {}; stack[stack.length - 1][key] = o; stack.push(o); key = null; }
    else if (m[2] === "}") { stack.pop(); if (!stack.length) break; }
    else { const s = m[1].replace(/\\\\/g, "\\").replace(/\\"/g, '"'); if (key == null) key = s; else { stack[stack.length - 1][key] = s; key = null; } }
  }
  return root;
}
const lower = (o) => { const r = {}; for (const k in o || {}) r[k.toLowerCase()] = o[k]; return r; };

// ---------------------------------------------------------------- Steam
const STEAM_SKIP = /redistributable|steam linux runtime|proton |steamworks|steamvr performance test/i;
async function steam() {
  let root = await sys.regGet("HKCU\\Software\\Valve\\Steam", "SteamPath");
  if (!root || !exists(root)) root = ["C:\\Program Files (x86)\\Steam", "C:\\Program Files\\Steam"].find(exists);
  if (!root) return { games: [], root: null };
  root = path.resolve(root);
  // o caminho do libraryfolders.vdf substitui o do registro: vem com as maiúsculas certas (o registro guarda tudo minúsculo)
  const libs = new Map([[norm(root), root]]);
  try { const lf = vdf(fs.readFileSync(path.join(root, "steamapps", "libraryfolders.vdf"), "utf8")); for (const v of Object.values(lower(lf).libraryfolders || {})) if (v && v.path) libs.set(norm(v.path), path.resolve(v.path)); } catch { /* biblioteca única */ }
  // tempo de jogo e última vez: localconfig.vdf de cada conta (fica com o maior valor)
  const play = {};
  try {
    for (const u of fs.readdirSync(path.join(root, "userdata"))) {
      const f = path.join(root, "userdata", u, "config", "localconfig.vdf");
      if (!exists(f)) continue;
      const lc = lower(lower(vdf(fs.readFileSync(f, "utf8"))).userlocalconfigstore);
      const apps = lower(lower(lower(lc.software).valve).steam).apps || {};
      for (const [id, a] of Object.entries(apps)) {
        const p = play[id] || (play[id] = { minutes: 0, last: 0 });
        p.minutes = Math.max(p.minutes, Number(a.Playtime || 0));
        p.last = Math.max(p.last, Number(a.LastPlayed || 0) * 1000);
      }
    }
  } catch { /* sem contas */ }
  const cache = path.join(root, "appcache", "librarycache");
  // capas que a Steam já baixou: librarycache/<id>/<nome> ou, nas versões novas, librarycache/<id>/<hash>/<nome>
  const art = (id) => {
    const files = new Map();
    try {
      for (const e of fs.readdirSync(path.join(cache, id), { withFileTypes: true })) {
        if (e.isFile()) files.set(e.name, path.join(cache, id, e.name));
        else if (e.isDirectory()) { try { for (const f of fs.readdirSync(path.join(cache, id, e.name))) if (!files.has(f)) files.set(f, path.join(cache, id, e.name, f)); } catch { /* sem acesso */ } }
      }
    } catch { /* sem cache */ }
    const pick = (...names) => { for (const n of names) { if (files.has(n)) return files.get(n); const old = path.join(cache, `${id}_${n}`); if (exists(old)) return old; } return null; };
    const cdn = (name) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${id}/${name}`;
    return { cover: pick("library_600x900.jpg", "library_capsule.jpg") || cdn("library_600x900.jpg"), hero: pick("library_hero.jpg") || cdn("library_hero.jpg"),
      logo: pick("logo.png") || cdn("logo.png"), header: pick("header.jpg", "library_header.jpg") || cdn("header.jpg") };
  };
  const games = [];
  for (const lib of libs.values()) {
    const apps = path.join(lib, "steamapps");
    let files = []; try { files = fs.readdirSync(apps).filter((f) => /^appmanifest_\d+\.acf$/.test(f)); } catch { continue; }
    for (const f of files) {
      let st; try { st = lower(vdf(fs.readFileSync(path.join(apps, f), "utf8")).AppState); } catch { continue; }
      if (!st.appid || !st.name || STEAM_SKIP.test(st.name) || st.appid === "228980") continue;
      const dir = path.join(apps, "common", st.installdir || "");
      if (!exists(dir)) continue;
      const p = play[st.appid] || {};
      games.push({ id: "steam:" + st.appid, launcher: "steam", name: st.name, dir, size: Number(st.sizeondisk) || 0, steamAppId: Number(st.appid),
        launch: { url: `steam://rungameid/${st.appid}` }, store: `https://store.steampowered.com/app/${st.appid}`,
        steamMinutes: p.minutes || 0, lastPlayed: p.last || Number(st.lastplayed || 0) * 1000 || 0, updatedAt: Number(st.lastupdated || 0) * 1000 || 0,
        installing: !(Number(st.stateflags) & 4), art: art(st.appid) });
    }
  }
  return { games, root };
}

// ---------------------------------------------------------------- Epic Games
function epic() {
  const dir = path.join(process.env.ProgramData || "C:\\ProgramData", "Epic", "EpicGamesLauncher", "Data", "Manifests");
  let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith(".item")); } catch { return []; }
  const games = [];
  for (const f of files) {
    let j; try { j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { continue; }
    const cats = (j.AppCategories || []).join(" ");
    // motores, plugins e conteúdos extras não são jogos
    if (j.bIsIncompleteInstall || !j.LaunchExecutable || /engines|plugins|addons|digitalextras/.test(cats) || (j.MainGameAppName && j.MainGameAppName !== j.AppName) || !exists(j.InstallLocation)) continue;
    games.push({ id: "epic:" + j.AppName, launcher: "epic", name: j.DisplayName, dir: j.InstallLocation, size: Number(j.InstallSize) || 0,
      launch: { url: `com.epicgames.launcher://apps/${j.CatalogNamespace}%3A${j.CatalogItemId}%3A${j.AppName}?action=launch&silent=true` },
      exe: path.join(j.InstallLocation, j.LaunchExecutable), updatedAt: mtime(path.join(dir, f)), art: {} });
  }
  return games;
}

// ---------------------------------------------------------------- Riot Games
const RIOT = { valorant: "VALORANT", league_of_legends: "League of Legends", bacon: "Legends of Runeterra", lion: "2XKO" };
function riot() {
  const base = path.join(process.env.ProgramData || "C:\\ProgramData", "Riot Games");
  let client = null;
  try { const j = JSON.parse(fs.readFileSync(path.join(base, "RiotClientInstalls.json"), "utf8")); client = j.rc_default || j.rc_live; } catch { return []; }
  const games = [];
  let dirs = []; try { dirs = fs.readdirSync(path.join(base, "Metadata")); } catch { return []; }
  for (const d of dirs) {
    const m = /^([a-z_]+)\.(live|pbe)$/.exec(d);
    if (!m || !RIOT[m[1]]) continue;
    const f = path.join(base, "Metadata", d, `${d}.product_settings.yaml`);
    let txt = ""; try { txt = fs.readFileSync(f, "utf8"); } catch { continue; }
    const dir = (/product_install_full_path:\s*"([^"]+)"/.exec(txt) || [])[1];
    if (!dir || !exists(dir)) continue;
    const ico = path.join(base, "Metadata", d, `${d}.ico`);
    games.push({ id: "riot:" + d, launcher: "riot", name: RIOT[m[1]] + (m[2] === "pbe" ? " (PBE)" : ""), dir: path.resolve(dir), size: 0,
      launch: { exe: client, args: [`--launch-product=${m[1]}`, `--launch-patchline=${m[2]}`] }, updatedAt: mtime(f), art: { icon: exists(ico) ? ico : null } });
  }
  return games;
}

// ---------------------------------------------------------------- GOG, Ubisoft, EA, Battle.net, Rockstar e outros (registro) e Xbox / Game Pass
const PS_SCAN = String.raw`
$out = @()
foreach ($k in Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\GOG.com\Games') { $p = Get-ItemProperty $k.PSPath; $out += [pscustomobject]@{ kind='gog'; id=[string]$p.gameID; name=$p.gameName; dir=$p.path; exe=$p.exe; args=$p.launchParam; cwd=$p.workingDir } }
foreach ($k in Get-ChildItem 'HKLM:\SOFTWARE\WOW6432Node\Ubisoft\Launcher\Installs') { $p = Get-ItemProperty $k.PSPath; $u = Get-ItemProperty ('HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Uplay Install ' + $k.PSChildName); $out += [pscustomobject]@{ kind='ubi'; id=$k.PSChildName; name=$u.DisplayName; dir=$p.InstallDir } }
$un = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*','HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
foreach ($p in Get-ItemProperty $un) { if ($p.Publisher -match 'Electronic Arts|Blizzard|Rockstar Games|Activision|Bethesda|Mojang|Square Enix|CD PROJEKT|Paradox Interactive|BANDAI NAMCO' -and $p.InstallLocation -and -not $p.SystemComponent) { $out += [pscustomobject]@{ kind='reg'; id=$p.PSChildName; name=$p.DisplayName; dir=$p.InstallLocation; icon=$p.DisplayIcon; publisher=$p.Publisher } } }
foreach ($d in Get-PSDrive -PSProvider FileSystem) { $x = Join-Path $d.Root 'XboxGames'; if (Test-Path $x) { foreach ($g in Get-ChildItem $x -Directory) { $cfg = Join-Path $g.FullName 'Content\MicrosoftGame.config'; if (Test-Path $cfg) { [xml]$c = Get-Content $cfg -Raw; $gm = $c.Game; $idn = $gm.Identity.Name; $pkg = Get-AppxPackage -Name $idn | Select-Object -First 1; $ex = @($gm.ExecutableList.Executable)[0]; $out += [pscustomobject]@{ kind='xbox'; id=$idn; name=$gm.ShellVisuals.DefaultDisplayName; dir=(Join-Path $g.FullName 'Content'); exe=$ex.Name; appId=$ex.Id; pfn=$pkg.PackageFamilyName; logo=$gm.ShellVisuals.Square150x150Logo } } } } }
$out`;
const LAUNCHER_APPS = /^(ea app|ea desktop|origin|battle\.net|rockstar games launcher|ubisoft connect|uplay|minecraft launcher|bethesda\.net launcher|social club|rockstar games social club)$/i;
const PUB = [[/electronic arts/i, "ea"], [/blizzard|activision/i, "battlenet"], [/rockstar/i, "rockstar"]];
async function registry() {
  let rows = []; try { rows = await sys.psJson(PS_SCAN, 90000); } catch { return []; }
  const games = [];
  for (const r of rows) {
    if (!r || !r.dir || !exists(r.dir)) continue;
    const dir = path.resolve(r.dir);
    if (r.kind === "gog") {
      const exe = r.exe && exists(r.exe) ? r.exe : null;
      games.push({ id: "gog:" + r.id, launcher: "gog", name: r.name || path.basename(dir), dir, size: 0, launch: exe ? { exe, args: r.args ? String(r.args).match(/(?:[^\s"]+|"[^"]*")+/g).map((a) => a.replace(/"/g, "")) : [], cwd: r.cwd || dir } : { url: `goggalaxy://openGameView/${r.id}` }, art: { icon: exe } });
    } else if (r.kind === "ubi") {
      games.push({ id: "ubi:" + r.id, launcher: "ubisoft", name: r.name || path.basename(dir), dir, size: 0, launch: { url: `uplay://launch/${r.id}/0` }, art: {} });
    } else if (r.kind === "xbox") {
      if (!r.pfn) continue;
      const logo = r.logo ? path.join(dir, r.logo) : null;
      games.push({ id: "xbox:" + r.id, launcher: "xbox", name: r.name && !/^ms-resource:/i.test(r.name) ? r.name : path.basename(path.dirname(dir)), dir, size: 0,
        launch: { exe: path.join(process.env.SystemRoot || "C:\\Windows", "explorer.exe"), args: [`shell:AppsFolder\\${r.pfn}!${r.appId || "Game"}`] }, art: { icon: logo && exists(logo) ? logo : null } });
    } else if (r.kind === "reg") {
      if (LAUNCHER_APPS.test(String(r.name || "").trim())) continue;
      const icon = String(r.icon || "").replace(/"/g, "").replace(/,\s*-?\d+$/, "");
      const exe = /\.exe$/i.test(icon) && exists(icon) ? icon : null;
      const launcher = (PUB.find(([re]) => re.test(r.publisher)) || [null, "other"])[1];
      games.push({ id: "reg:" + r.id, launcher, name: r.name || path.basename(dir), dir, size: 0, launch: exe ? { exe, cwd: path.dirname(exe) } : { folder: dir }, art: { icon: exe } });
    }
  }
  return games;
}

// ---------------------------------------------------------------- tudo junto (sem repetir a mesma pasta)
async function scanAll(custom = []) {
  const [s, reg] = await Promise.all([steam(), registry()]);
  const all = [...s.games, ...epic(), ...riot(), ...reg, ...custom.filter((c) => exists(c.dir))];
  const seen = new Set(), out = [];
  for (const g of all) { const k = norm(g.dir); if (seen.has(k)) continue; seen.add(k); out.push(g); }
  return { games: out, steamRoot: s.root };
}

module.exports = { scanAll, steam, epic, riot, registry, vdf, norm };
