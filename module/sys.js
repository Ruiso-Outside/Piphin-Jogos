// Piphin Jogos · utilitários do sistema: rodar comandos, registro (reg.exe), PowerShell e tamanho de pastas.
// Só programas do próprio Windows (sem dependências nativas).
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

const SYS = process.env.SystemRoot || "C:\\Windows";
const exe = (name) => path.join(SYS, "System32", name);
const POWERSHELL = exe("WindowsPowerShell\\v1.0\\powershell.exe");

function run(file, args, { timeout = 60000 } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout, maxBuffer: 64 * 1024 * 1024, encoding: "buffer" }, (err, stdout, stderr) => {
      const dec = (b) => { const s = b.toString("utf8"); return s.includes("\uFFFD") ? b.toString("latin1") : s; };
      resolve({ code: err ? (typeof err.code === "number" ? err.code : 1) : 0, out: dec(stdout || Buffer.alloc(0)), err: dec(stderr || Buffer.alloc(0)) });
    });
  });
}

// PowerShell com saída em JSON (UTF-8)
async function psJson(script, timeout = 60000) {
  const full = `$ProgressPreference='SilentlyContinue';$ErrorActionPreference='SilentlyContinue';[Console]::OutputEncoding=[Text.Encoding]::UTF8;$r = & { ${script} };ConvertTo-Json -InputObject @($r) -Depth 6 -Compress`;
  const r = await run(POWERSHELL, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", full], { timeout });
  const txt = r.out.trim();
  if (!txt) return [];
  try { return JSON.parse(txt); } catch { throw new Error("PowerShell: " + (r.err || txt).slice(0, 300)); }
}

// um valor do registro (texto) ou null
async function regGet(key, name) {
  const r = await run(exe("reg.exe"), ["query", key, "/v", name]);
  if (r.code !== 0) return null;
  for (const line of r.out.split(/\r?\n/)) {
    const m = /^\s{4}(.+?)\s{4}(REG_\w+)\s{4}?(.*)$/.exec(line);
    if (m && m[1].toLowerCase() === name.toLowerCase()) return (m[3] || "").trim();
  }
  return null;
}

// tamanho de uma pasta, com limite de tempo (jogos grandes têm dezenas de milhares de arquivos)
async function dirSize(dir, deadline = Date.now() + 60000) {
  let bytes = 0;
  const walk = async (d) => {
    if (Date.now() > deadline) return;
    let list;
    try { list = await fs.promises.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of list) {
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) await walk(p);
      else { try { bytes += (await fs.promises.stat(p)).size; } catch { /* sem acesso */ } }
    }
  };
  await walk(dir);
  return bytes;
}

module.exports = { run, psJson, regGet, dirSize, POWERSHELL };
