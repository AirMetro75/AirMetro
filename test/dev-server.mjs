// Serveur de test local : simule Cloudflare Pages (fichiers statiques + fonction /api + base D1 via node:sqlite)
import http from "node:http"; import fs from "node:fs"; import path from "node:path"; import { DatabaseSync } from "node:sqlite";
import { onRequest } from "../functions/api/[[route]].js";
const db = new DatabaseSync(":memory:"); db.exec(fs.readFileSync("schema.sql", "utf8"));
const wrap = (sql) => { const st = db.prepare(sql);
  const mk = (args) => ({ bind: (...a) => mk(a), all: async () => ({ results: st.all(...args) }), first: async () => st.get(...args) ?? null, _run: () => st.run(...args) });
  return mk([]); };
const DB = { prepare: wrap, batch: async (l) => { db.exec("BEGIN"); try { l.forEach((s) => s._run()); db.exec("COMMIT"); } catch (e) { db.exec("ROLLBACK"); throw e; } } };
const env = { DB, UPLOAD_KEY: "secret-test" };
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript" };
http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname.startsWith("/api/")) {
    const chunks = []; for await (const c of req) chunks.push(c);
    const r = await onRequest({ request: new Request(u, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) }), env });
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer())); return;
  }
  const f = path.join("public", u.pathname === "/" ? "index.html" : u.pathname);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": types[path.extname(f)] || "text/plain" }); res.end(fs.readFileSync(f));
}).listen(8790, () => console.log("ok 8790"));
