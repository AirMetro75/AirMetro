// API AirMétro (Cloudflare Pages Functions + base D1)
//   GET  /api/summary?days=30            moyennes par station et par ligne
//   GET  /api/history?name=X&days=60     moyennes par jour d'une station
//   POST /api/upload  (en-tête X-Key)    envoi de passages : {"visits":[{t,name,line,c,a,b,x,tp,hu,pr},...]}
import { STATIONS } from "../_stations.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Key",
};
const json = (o, status = 200, extra = {}) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });

const MAX_VISITS_PER_UPLOAD = 150;
const MAX_VISITS_PER_HOUR = 600;      // plafond global : limite les dégâts en cas de clé divulguée
const num = (v, lo, hi) => (typeof v === "number" && isFinite(v) && v >= lo && v <= hi ? v : null);
const opt = (v, lo, hi) => (v === null || v === undefined || v === "" ? null : num(v, lo, hi));

function clean(v, now) {
  if (!v || typeof v !== "object") return null;
  const lines = STATIONS[v.name];
  if (!lines || !lines.includes(String(v.line))) return null;
  const t = Math.floor(Number(v.t) / 600) * 600;
  if (!(t > now - 90 * 86400 && t < now + 3600)) return null;
  const c = num(v.c, 1, 2000), a = num(v.a, 0, 1000), b = num(v.b, 0, 2000), x = num(v.x, 0, 1000);
  if (c === null || a === null || b === null || x === null) return null;
  if (b < a * 0.9 - 1) return null;                  // PM10 inclut PM2.5 : sinon capteur défaillant
  return {
    t, name: v.name, line: String(v.line), c: Math.round(c),
    a: Math.round(a * 10) / 10, b: Math.round(b * 10) / 10, x: Math.round(x * 10) / 10,
    tp: opt(v.tp, -20, 60), hu: opt(v.hu, 0, 100), pr: opt(v.pr, 850, 1100),
  };
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (!env.DB) return json({ error: "Base de données non liée (binding DB manquant)" }, 500);
  const now = Math.floor(Date.now() / 1000);

  if (route === "summary" && request.method === "GET") {
    const days = Math.min(3650, Math.max(1, parseInt(url.searchParams.get("days") || "30", 10) || 30));
    const { results } = await env.DB.prepare(
      `SELECT name AS n, line AS l, COUNT(*) AS v, SUM(c) AS c,
              ROUND(SUM(a*c)/SUM(c),1) AS a, ROUND(SUM(b*c)/SUM(c),1) AS b, MAX(x) AS x, MAX(t) AS t,
              ROUND(AVG(tp),1) AS tp, ROUND(AVG(hu),0) AS hu, ROUND(AVG(pr),0) AS pr
       FROM visits WHERE t >= ?1 GROUP BY name, line`
    ).bind(now - days * 86400).all();
    return json({ now, days, rows: results }, 200, { "Cache-Control": "public, max-age=120" });
  }

  if (route === "history" && request.method === "GET") {
    const name = url.searchParams.get("name") || "";
    if (!STATIONS[name]) return json({ error: "station inconnue" }, 404);
    const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") || "60", 10) || 60));
    const { results } = await env.DB.prepare(
      `SELECT strftime('%Y-%m-%d', t, 'unixepoch') AS d, SUM(c) AS c,
              ROUND(SUM(a*c)/SUM(c),1) AS a, ROUND(SUM(b*c)/SUM(c),1) AS b
       FROM visits WHERE name = ?1 AND t >= ?2 GROUP BY d ORDER BY d`
    ).bind(name, now - days * 86400).all();
    return json({ name, rows: results }, 200, { "Cache-Control": "public, max-age=120" });
  }

  if (route === "upload" && request.method === "POST") {
    if (!env.UPLOAD_KEY) return json({ error: "Envoi désactivé : variable UPLOAD_KEY non définie" }, 503);
    if (request.headers.get("X-Key") !== env.UPLOAD_KEY) return json({ error: "Clé refusée" }, 401);
    let body;
    try { body = await request.json(); } catch { return json({ error: "JSON invalide" }, 400); }
    const raw = Array.isArray(body && body.visits) ? body.visits : null;
    if (!raw) return json({ error: "champ visits manquant" }, 400);
    if (raw.length > MAX_VISITS_PER_UPLOAD) return json({ error: `maximum ${MAX_VISITS_PER_UPLOAD} passages par envoi` }, 413);
    const rows = raw.map((v) => clean(v, now)).filter(Boolean);
    const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM visits WHERE created >= ?1").bind(now - 3600).first();
    if ((recent ? recent.n : 0) + rows.length > MAX_VISITS_PER_HOUR) return json({ error: "Trop d'envois, réessayez plus tard" }, 429);
    if (rows.length) {
      const st = env.DB.prepare(
        `INSERT OR IGNORE INTO visits (t,name,line,c,a,b,x,tp,hu,pr,created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`
      );
      await env.DB.batch(rows.map((r) => st.bind(r.t, r.name, r.line, r.c, r.a, r.b, r.x, r.tp, r.hu, r.pr, now)));
    }
    return json({ ok: 1, received: raw.length, accepted: rows.length, rejected: raw.length - rows.length });
  }

  return json({ error: "route inconnue" }, 404);
}
