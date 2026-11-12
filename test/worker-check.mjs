import w from "../worker.js";
const env = { ASSETS: { fetch: async () => new Response("asset") }, DB: null };
const a = await w.fetch(new Request("http://x/"), env); console.log("static:", await a.text());
const b = await w.fetch(new Request("http://x/api/summary"), env); console.log("api:", b.status, await b.text());
