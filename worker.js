// Point d'entrée Cloudflare Workers : /api/* -> API ; le reste -> fichiers statiques du dossier public/
import { onRequest } from "./functions/api/[[route]].js";

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return onRequest({ request, env });
    return env.ASSETS.fetch(request);
  },
};
