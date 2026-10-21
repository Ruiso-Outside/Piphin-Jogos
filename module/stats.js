// Piphin Jogos · estatísticas a partir das sessões contadas (e do tempo total que a Steam guarda).
const DAY = 86400000, MIN = 60000;
const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const startOfDay = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

// divide uma sessão em pedaços que não passam da virada de hora (para "a que horas você joga" e minutos por dia)
function* pieces(s, e) {
  let t = s;
  while (t < e) { const h = new Date(t); h.setMinutes(60, 0, 0); const end = Math.min(e, h.getTime()); yield [t, end]; t = end; }
}

function compute(games, sessions, now = Date.now()) {
  const byGame = new Map(games.map((g) => [g.id, { minutes: 0, sessions: 0, longest: 0, last: 0, first: 0, days: new Map() }]));
  const byDay = new Map(), byHour = new Array(24).fill(0), byWeekday = new Array(7).fill(0);
  let tracked = 0, first = 0, longest = null;
  for (const ses of sessions) {
    const g = byGame.get(ses.g); if (!g) continue;
    const len = (ses.e - ses.s) / MIN;
    g.minutes += len; g.sessions++; g.longest = Math.max(g.longest, len); g.last = Math.max(g.last, ses.e); g.first = g.first ? Math.min(g.first, ses.s) : ses.s;
    if (!longest || len > longest.minutes) longest = { id: ses.g, minutes: len, at: ses.s };
    tracked += len; first = first ? Math.min(first, ses.s) : ses.s;
    for (const [a, b] of pieces(ses.s, ses.e)) {
      const m = (b - a) / MIN, k = dayKey(a), d = new Date(a);
      byDay.set(k, (byDay.get(k) || 0) + m); g.days.set(k, (g.days.get(k) || 0) + m);
      byHour[d.getHours()] += m; byWeekday[d.getDay()] += m;
    }
  }
  // sequência de dias seguidos jogando
  const today = startOfDay(now);
  let streak = 0; for (let t = byDay.has(dayKey(today)) ? today : today - DAY; byDay.has(dayKey(t)); t -= DAY) streak++;
  let best = 0, run = 0; const keys = [...byDay.keys()].sort();
  for (let i = 0; i < keys.length; i++) { run = i && startOfDay(new Date(keys[i] + "T12:00").getTime()) - startOfDay(new Date(keys[i - 1] + "T12:00").getTime()) === DAY ? run + 1 : 1; best = Math.max(best, run); }
  const weekMin = (from, to) => { let m = 0; for (let t = from; t < to; t += DAY) m += byDay.get(dayKey(t)) || 0; return m; };
  const weekStart = today - ((new Date(today).getDay() + 6) % 7) * DAY; // segunda-feira

  const perGame = {};
  for (const g of games) {
    const s = byGame.get(g.id);
    const last30 = []; for (let t = today - 29 * DAY; t <= today; t += DAY) last30.push(Math.round(s.days.get(dayKey(t)) || 0));
    perGame[g.id] = { tracked: Math.round(s.minutes), total: Math.round(Math.max(s.minutes, g.steamMinutes || 0)), sessions: s.sessions, longest: Math.round(s.longest),
      avg: s.sessions ? Math.round(s.minutes / s.sessions) : 0, lastPlayed: Math.max(s.last, g.lastPlayed || 0), firstTracked: s.first, last30 };
  }
  const heat = []; for (let t = today - 181 * DAY; t <= today; t += DAY) heat.push([dayKey(t), Math.round(byDay.get(dayKey(t)) || 0)]);
  const launchers = {};
  for (const g of games) launchers[g.launcher] = (launchers[g.launcher] || 0) + perGame[g.id].total;
  return {
    perGame, tracked: Math.round(tracked), total: Object.values(perGame).reduce((a, p) => a + p.total, 0), firstTracked: first, sessions: sessions.length,
    longest: longest && { ...longest, minutes: Math.round(longest.minutes) }, streak, bestStreak: best, heat,
    byHour: byHour.map(Math.round), byWeekday: byWeekday.map(Math.round), launchers,
    thisWeek: Math.round(weekMin(weekStart, today + DAY)), lastWeek: Math.round(weekMin(weekStart - 7 * DAY, weekStart)),
    daysPlayed: byDay.size,
  };
}

module.exports = { compute, dayKey };
