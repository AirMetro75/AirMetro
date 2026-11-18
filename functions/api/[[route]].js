// API AirMétro (Cloudflare Pages Functions + base D1)
//   GET  /api/summary?days=30            moyennes par station et par ligne
//   GET  /api/history?name=X&days=60     moyennes par jour d'une station
//   POST /api/register                   crée un identifiant de capteur (sans compte) : {id, key}
//   POST /api/upload  (X-Sensor, X-Key)  envoi de passages : {"visits":[{t,name,line,c,a,b,x,tp,hu,pr},...]}
//   GET  /api/admin/sensors, POST /api/admin/ban  (X-Admin)  modération
import { STATIONS } from "../_stations.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Key, X-Sensor, X-Admin",
};
const json = (o, status = 200, extra = {}) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS, ...extra },
  });

const MAX_VISITS_PER_UPLOAD = 150;
const MAX_VISITS_PER_SENSOR_HOUR = 300;   // plafond par capteur
const MAX_VISITS_PER_HOUR = 3000;         // plafond global
const MAX_REGISTER_PER_HOUR = 30;         // créations d'identifiants (anti-abus)
const MAX_REGISTER_PER_DAY = 200;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";   // sans caractères ambigus (0/O, 1/I/L)
const rand = (n) => { const b = crypto.getRandomValues(new Uint8Array(n)); return Array.from(b, (x) => ALPHABET[x % ALPHABET.length]).join(""); };
const sha256 = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), (b) => b.toString(16).padStart(2, "0")).join("");
async function authSensor(request, env) {
  const id = request.headers.get("X-Sensor") || "", key = request.headers.get("X-Key") || "";
  if (!/^AM-[A-Z0-9]{6}$/.test(id) || key.length < 16 || key.length > 64) return null;
  const row = await env.DB.prepare("SELECT id, token_hash, banned FROM sensors WHERE id = ?1").bind(id).first();
  if (!row || row.token_hash !== (await sha256(key))) return null;
  return row;
}
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
    const since = now - days * 86400;
    const { results } = await env.DB.prepare(
      `SELECT vi.name AS n, vi.line AS l, COUNT(*) AS v, SUM(vi.c) AS c,
              ROUND(SUM(vi.a*vi.c)/SUM(vi.c),1) AS a, ROUND(SUM(vi.b*vi.c)/SUM(vi.c),1) AS b, MAX(vi.x) AS x, MAX(vi.t) AS t,
              ROUND(AVG(vi.tp),1) AS tp, ROUND(AVG(vi.hu),0) AS hu, ROUND(AVG(vi.pr),0) AS pr
       FROM visits vi JOIN sensors s ON s.id = vi.sensor AND s.banned = 0
       WHERE vi.t >= ?1 GROUP BY vi.name, vi.line`
    ).bind(since).all();
    const cnt = await env.DB.prepare(
      `SELECT COUNT(DISTINCT vi.sensor) AS n FROM visits vi JOIN sensors s ON s.id = vi.sensor AND s.banned = 0 WHERE vi.t >= ?1`
    ).bind(since).first();
    return json({ now, days, sensors: cnt ? cnt.n : 0, rows: results }, 200, { "Cache-Control": "public, max-age=120" });
  }

  if (route === "history" && request.method === "GET") {
    const name = url.searchParams.get("name") || "";
    if (!STATIONS[name]) return json({ error: "station inconnue" }, 404);
    const days = Math.min(365, Math.max(1, parseInt(url.searchParams.get("days") || "60", 10) || 60));
    const { results } = await env.DB.prepare(
      `SELECT strftime('%Y-%m-%d', vi.t, 'unixepoch') AS d, SUM(vi.c) AS c,
              ROUND(SUM(vi.a*vi.c)/SUM(vi.c),1) AS a, ROUND(SUM(vi.b*vi.c)/SUM(vi.c),1) AS b
       FROM visits vi JOIN sensors s ON s.id = vi.sensor AND s.banned = 0
       WHERE vi.name = ?1 AND vi.t >= ?2 GROUP BY d ORDER BY d`
    ).bind(name, now - days * 86400).all();
    return json({ name, rows: results }, 200, { "Cache-Control": "public, max-age=120" });
  }

  if (route === "register" && request.method === "POST") {
    const h = await env.DB.prepare("SELECT COUNT(*) AS n FROM sensors WHERE created >= ?1").bind(now - 3600).first();
    const d = await env.DB.prepare("SELECT COUNT(*) AS n FROM sensors WHERE created >= ?1").bind(now - 86400).first();
    if ((h ? h.n : 0) >= MAX_REGISTER_PER_HOUR || (d ? d.n : 0) >= MAX_REGISTER_PER_DAY) return json({ error: "Trop de créations d'identifiants, réessayez plus tard" }, 429);
    const key = rand(24), hash = await sha256(key);
    for (let i = 0; i < 5; i++) {
      const id = "AM-" + rand(6);
      try {
        await env.DB.prepare("INSERT INTO sensors (id, token_hash, created) VALUES (?1, ?2, ?3)").bind(id, hash, now).run();
        return json({ id, key });
      } catch (e) { /* collision d'identifiant : on retente */ }
    }
    return json({ error: "Création impossible, réessayez" }, 500);
  }

  if (route === "upload" && request.method === "POST") {
    const sensor = await authSensor(request, env);
    if (!sensor) return json({ error: "Identifiant ou clé refusés" }, 401);
    if (sensor.banned) return json({ error: "Ce capteur est suspendu" }, 403);
    let body;
    try { body = await request.json(); } catch { return json({ error: "JSON invalide" }, 400); }
    const raw = Array.isArray(body && body.visits) ? body.visits : null;
    if (!raw) return json({ error: "champ visits manquant" }, 400);
    if (raw.length > MAX_VISITS_PER_UPLOAD) return json({ error: `maximum ${MAX_VISITS_PER_UPLOAD} passages par envoi` }, 413);
    const rows = raw.map((v) => clean(v, now)).filter(Boolean);
    const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM visits WHERE sensor = ?1 AND created >= ?2").bind(sensor.id, now - 3600).first();
    const all = await env.DB.prepare("SELECT COUNT(*) AS n FROM visits WHERE created >= ?1").bind(now - 3600).first();
    if ((mine ? mine.n : 0) + rows.length > MAX_VISITS_PER_SENSOR_HOUR || (all ? all.n : 0) + rows.length > MAX_VISITS_PER_HOUR)
      return json({ error: "Trop d'envois, réessayez plus tard" }, 429);
    const stmts = [env.DB.prepare("UPDATE sensors SET last_seen = ?1 WHERE id = ?2").bind(now, sensor.id)];
    const ins = env.DB.prepare(
      `INSERT OR IGNORE INTO visits (sensor,t,name,line,c,a,b,x,tp,hu,pr,created) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`
    );
    rows.forEach((r) => stmts.push(ins.bind(sensor.id, r.t, r.name, r.line, r.c, r.a, r.b, r.x, r.tp, r.hu, r.pr, now)));
    await env.DB.batch(stmts);
    return json({ ok: 1, sensor: sensor.id, received: raw.length, accepted: rows.length, rejected: raw.length - rows.length });
  }

  if (route.startsWith("admin/")) {
    if (!env.ADMIN_KEY || request.headers.get("X-Admin") !== env.ADMIN_KEY) return json({ error: "Accès refusé" }, 401);
    if (route === "admin/sensors" && request.method === "GET") {
      const { results } = await env.DB.prepare(
        `SELECT s.id, s.created, s.last_seen, s.banned, (SELECT COUNT(*) FROM visits v WHERE v.sensor = s.id) AS visits FROM sensors s ORDER BY s.created DESC LIMIT 500`
      ).all();
      return json({ rows: results });
    }
    if (route === "admin/ban" && request.method === "POST") {
      let b; try { b = await request.json(); } catch { return json({ error: "JSON invalide" }, 400); }
      if (!/^AM-[A-Z0-9]{6}$/.test(b && b.id)) return json({ error: "identifiant invalide" }, 400);
      await env.DB.prepare("UPDATE sensors SET banned = ?1 WHERE id = ?2").bind(b.banned ? 1 : 0, b.id).run();
      return json({ ok: 1 });
    }
  }

  return json({ error: "route inconnue" }, 404);
}
