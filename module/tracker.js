// Piphin Jogos · conta o tempo de jogo de qualquer loja: a cada 15 s olha os programas abertos e vê quais estão na pasta de um jogo.
// Windows: um único PowerShell fica rodando em segundo plano (mais leve do que abrir um a cada vez).
// Linux: lê o /proc daqui mesmo. Jogos pelo Proton/Wine rodam como wine64, mas o .exe do jogo aparece nos argumentos.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { POWERSHELL } = require("./sys");

const POLL = 15;
const LOOP = `[Console]::OutputEncoding=[Text.Encoding]::UTF8;while($true){$p=(Get-Process | Where-Object {$_.Path} | ForEach-Object {$_.Path} | Sort-Object -Unique) -join '|';[Console]::Out.WriteLine('P:'+$p);[Console]::Out.Flush();Start-Sleep -Seconds ${POLL}}`;
const IS_WIN = process.platform === "win32";
const SEP = IS_WIN ? "\\" : "/";
const key = (p) => (IS_WIN ? p.toLowerCase() : p);

// Linux: caminhos de cada processo (programa, pasta atual com "/" no fim e argumentos que são caminhos)
function linuxPaths() {
  const out = new Set();
  let list = [];
  try { list = fs.readdirSync("/proc"); } catch { return out; }
  for (const d of list) {
    if (!/^\d+$/.test(d)) continue;
    try { out.add(fs.readlinkSync(`/proc/${d}/exe`).replace(/ \(deleted\)$/, "")); } catch { /* de outro usuário */ }
    try { out.add(fs.readlinkSync(`/proc/${d}/cwd`).replace(/\/?$/, "/")); } catch { /* idem */ }
    try {
      for (const a of fs.readFileSync(`/proc/${d}/cmdline`, "utf8").split("\0").slice(0, 8)) {
        if (a.startsWith("/")) out.add(a);
        else if (/^z:\\/i.test(a)) out.add(a.slice(2).replace(/\\/g, "/")); // Z:\home\... do Wine
      }
    } catch { /* já fechou */ }
  }
  return out;
}

function createTracker({ dataDir, onStart, onEnd, onTick }) {
  const FILE = path.join(dataDir, "sessoes.json");
  let sessions = []; try { sessions = JSON.parse(fs.readFileSync(FILE, "utf8")).map(({ g, s, e }) => ({ g, s, e })); } catch { /* primeira vez */ }
  let dirs = []; // [{ id, dir }] (no Windows em minúsculas), com a barra no fim
  const active = new Map(); // id -> { s, last, miss, exes }
  let proc = null, stopped = false, lastSave = 0;

  const persist = () => {
    lastSave = Date.now();
    const open = [...active.entries()].map(([g, a]) => ({ g, s: a.s, e: a.last }));
    try { fs.writeFileSync(FILE, JSON.stringify([...sessions, ...open])); } catch { /* sem disco */ }
  };
  function setGames(games) {
    dirs = games.map((g) => ({ id: g.id, dir: key(path.resolve(g.dir)).replace(/[\\/]*$/, SEP) }))
      .filter((d) => d.dir.split(SEP).filter(Boolean).length >= 3) // nunca "C:\" ou "C:\Program Files" (ou "/home/x") inteiros
      .sort((a, b) => b.dir.length - a.dir.length);
  }
  function close(id, a) {
    active.delete(id);
    if (a.last - a.s >= 60000) { const ses = { g: id, s: a.s, e: a.last }; sessions.push(ses); onEnd && onEnd(ses); }
    persist();
  }
  function handle(line) {
    if (!line.startsWith("P:")) return;
    const now = Date.now(), running = new Map(); // id -> nomes dos programas do jogo abertos agora
    for (const p of line.slice(2).split("|")) {
      const lp = key(p);
      const hit = dirs.find((d) => lp.startsWith(d.dir));
      if (!hit) continue;
      const set = running.get(hit.id) || running.set(hit.id, new Set()).get(hit.id);
      if (!lp.endsWith(SEP)) set.add(lp.slice(lp.lastIndexOf(SEP) + 1)); // a pasta atual conta, mas não é um programa
    }
    for (const [id, exes] of running) {
      const a = active.get(id);
      if (a) { a.last = now; a.miss = 0; for (const e of exes) a.exes.add(e); } else { active.set(id, { s: now, last: now, miss: 0, exes }); onStart && onStart(id); }
    }
    for (const [id, a] of active) if (!running.has(id) && ++a.miss >= 2) close(id, a); // fechou mesmo (não foi só uma troca de processo)
    if (active.size && now - lastSave > 60000) persist();
    onTick && onTick();
  }
  function start() {
    if (proc || stopped) return;
    if (!IS_WIN) {
      const tick = () => { try { handle("P:" + [...linuxPaths()].join("|")); } catch { /* tenta na próxima */ } };
      const timer = setInterval(tick, POLL * 1000);
      proc = { kill: () => clearInterval(timer) };
      tick();
      return;
    }
    proc = spawn(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", LOOP], { windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    let buf = "";
    proc.stdout.setEncoding("utf8");
    proc.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { handle(buf.slice(0, i).trim()); buf = buf.slice(i + 1); } });
    proc.on("exit", () => { proc = null; if (!stopped) setTimeout(start, 5000); });
  }
  function stop() { stopped = true; for (const [id, a] of [...active]) close(id, a); if (proc) proc.kill(); }
  const now = () => [...active.entries()].map(([id, a]) => ({ id, since: a.s, exes: [...a.exes] }));
  return { setGames, start, stop, now, sessions: () => [...sessions, ...[...active.entries()].map(([g, a]) => ({ g, s: a.s, e: Date.now(), live: true }))] };
}

module.exports = { createTracker, linuxPaths };
