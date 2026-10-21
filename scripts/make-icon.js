// Desenha o ícone do Piphin Jogos: icons/jogos.png (256). Uso: npm run icon (usa o Electron do Piphin Hub).
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await win.loadURL("about:blank");
  const b64 = await win.webContents.executeJavaScript(`(() => {
    const s = 256, c = document.createElement("canvas"); c.width = c.height = s;
    const g = c.getContext("2d");
    g.beginPath(); g.roundRect(8, 8, 240, 240, 56);
    const bg = g.createLinearGradient(0, 0, s, s); bg.addColorStop(0, "#3a1606"); bg.addColorStop(1, "#0d0a10");
    g.fillStyle = bg; g.fill();
    g.lineWidth = 3; g.strokeStyle = "rgba(249,115,22,.6)"; g.stroke();
    const grad = g.createLinearGradient(40, 200, 216, 70); grad.addColorStop(0, "#ea580c"); grad.addColorStop(.6, "#f97316"); grad.addColorStop(1, "#facc15");
    // barras de estatística atrás
    g.save(); g.globalAlpha = .28; g.fillStyle = "#fdba74";
    [[44, 60], [76, 92], [180, 74], [212, 46]].forEach(([x, h]) => { g.beginPath(); g.roundRect(x - 11, 214 - h, 22, h, 5); g.fill(); });
    g.restore();
    // controle
    g.save(); g.shadowColor = "#f97316"; g.shadowBlur = 24; g.fillStyle = grad;
    g.beginPath();
    g.moveTo(80, 92); g.lineTo(176, 92);
    g.bezierCurveTo(212, 92, 226, 150, 222, 176); g.bezierCurveTo(218, 200, 196, 206, 182, 188);
    g.lineTo(166, 166); g.lineTo(90, 166); g.lineTo(74, 188);
    g.bezierCurveTo(60, 206, 38, 200, 34, 176); g.bezierCurveTo(30, 150, 44, 92, 80, 92); g.closePath(); g.fill();
    g.restore();
    // cruz e botões
    g.fillStyle = "#1a0b04";
    g.beginPath(); g.roundRect(70, 120, 36, 12, 4); g.fill(); g.beginPath(); g.roundRect(82, 108, 12, 36, 4); g.fill();
    [[164, 114], [184, 132], [164, 150], [144, 132]].forEach(([x, y], i) => { g.beginPath(); g.arc(x, y, 8, 0, Math.PI * 2); g.fillStyle = i === 0 ? "#fff7ed" : "#1a0b04"; g.fill(); });
    return c.toDataURL("image/png").split(",")[1];
  })()`);
  fs.mkdirSync(path.join(__dirname, "..", "icons"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "icons", "jogos.png"), Buffer.from(b64, "base64"));
  console.log("ícone: icons/jogos.png");
  app.quit();
});
