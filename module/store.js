// Piphin Jogos · informações da loja Steam (descrição, gêneros, capturas, requisitos) e capas para jogos de outras lojas.
// API pública da loja, sem conta nem chave. Guardado em cache por 7 dias.
const fs = require("fs");
const path = require("path");
const https = require("https");

const WEEK = 7 * 24 * 3600 * 1000;
function getJson(url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "PiphinJogos/1.0", "Accept-Language": "pt-BR" }, timeout }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`A loja respondeu com erro ${res.statusCode}`)); }
      let s = ""; res.setEncoding("utf8"); res.on("data", (d) => (s += d)); res.on("end", () => { try { resolve(JSON.parse(s)); } catch { reject(new Error("A loja respondeu algo inesperado")); } });
    });
    req.on("timeout", () => req.destroy(new Error("A loja demorou demais")));
    req.on("error", reject);
  });
}
const strip = (html) => String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(li|p|ul)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
const simple = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[™®©]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

function createStore(dataDir) {
  const FILE = path.join(dataDir, "loja.json");
  let cache = {}; try { cache = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { /* vazio */ }
  let t = 0; const save = () => { clearTimeout(t); t = setTimeout(() => { try { fs.writeFileSync(FILE, JSON.stringify(cache)); } catch { /* sem disco */ } }, 500); };
  const fresh = (e) => e && Date.now() - e.at < WEEK;

  async function info(appid) {
    const k = "app:" + appid;
    if (fresh(cache[k])) return cache[k].data;
    const j = await getJson(`https://store.steampowered.com/api/appdetails?appids=${appid}&l=brazilian&cc=br`);
    const d = j && j[appid] && j[appid].success ? j[appid].data : null;
    const data = d ? {
      appid, name: d.name, short: strip(d.short_description), about: strip(d.about_the_game).slice(0, 3000), genres: (d.genres || []).map((g) => g.description),
      categories: (d.categories || []).map((c) => c.description).slice(0, 12), developers: d.developers || [], publishers: d.publishers || [], release: d.release_date && d.release_date.date,
      metacritic: d.metacritic ? { score: d.metacritic.score, url: d.metacritic.url } : null, recommendations: d.recommendations ? d.recommendations.total : 0,
      achievements: d.achievements ? d.achievements.total : 0, free: !!d.is_free, website: d.website || null,
      screenshots: (d.screenshots || []).slice(0, 8).map((s) => ({ thumb: s.path_thumbnail, full: s.path_full })),
      reqMin: strip(d.pc_requirements && d.pc_requirements.minimum).replace(/^m[ií]nimos?:\s*/i, ""), reqRec: strip(d.pc_requirements && d.pc_requirements.recommended).replace(/^recomendados?:\s*/i, ""),
      background: d.background_raw || d.background || null,
    } : null;
    cache[k] = { at: Date.now(), data }; save();
    return data;
  }
  // jogo de outra loja: procura o mesmo nome na Steam só para pegar capa e informações (nome tem que bater)
  async function match(name) {
    const k = "find:" + simple(name);
    if (fresh(cache[k])) return cache[k].data;
    let id = null;
    try {
      const j = await getJson(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&cc=br&l=portuguese`);
      const want = simple(name);
      const hit = (j.items || []).find((i) => simple(i.name) === want) || (j.items || []).find((i) => simple(i.name).replace(/ (remastered|definitive edition|goty edition|game of the year edition)$/, "") === want);
      id = hit ? hit.id : null;
    } catch { return null; } // sem internet: tenta de novo depois
    cache[k] = { at: Date.now(), data: id }; save();
    return id;
  }
  return { info, match };
}

module.exports = { createStore, simple };
