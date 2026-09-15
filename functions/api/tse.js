/**
 * Cloudflare Pages Function — proxy restrito para JSON do TSE.
 * O navegador tenta acessar o TSE diretamente e usa esta rota apenas como fallback.
 */
export async function onRequestGet(context) {
  const requestUrl = new URL(context.request.url);
  const raw = requestUrl.searchParams.get("url");
  if (!raw) return json({ error: "Parâmetro url ausente." }, 400);

  let target;
  try { target = new URL(raw); }
  catch { return json({ error: "URL inválida." }, 400); }

  const allowed = new Set(["resultados.tse.jus.br", "resultados-sim.tse.jus.br"]);
  if (target.protocol !== "https:" || !allowed.has(target.hostname)) return json({ error: "Destino não permitido." }, 403);
  if (!target.pathname.endsWith(".json")) return json({ error: "Somente arquivos JSON do TSE." }, 403);

  const historical = target.pathname.includes("/ele2022/");
  const ttl = historical ? 86400 : 5;
  const cache = caches.default;
  const cacheKey = new Request(context.request.url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return withCors(cached);

  const upstream = await fetch(target.toString(), {
    headers: { Accept: "application/json" },
    cf: { cacheEverything: true, cacheTtl: ttl },
  });

  const headers = new Headers(upstream.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Cache-Control", upstream.ok ? `public, max-age=${ttl}` : "no-store");
  headers.set("X-Data-Source", "TSE");
  const response = new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
  if (upstream.ok) context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Data-Source", "TSE-cache");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" } });
}
