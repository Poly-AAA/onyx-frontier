/** Serveur local : fichiers statiques + proxy LLM pour les PNJ (/api/npc). Les clés restent côté serveur (env). */
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;
const PORT = +process.env.PORT || 8797;
const PROVIDERS = [
  process.env.GROQ_API_KEY && { name: "groq", url: "https://api.groq.com/openai/v1/chat/completions", key: process.env.GROQ_API_KEY, model: process.env.KAOS_GROQ_MODEL || "openai/gpt-oss-20b", extra: { reasoning_effort: "low" } },
  process.env.MISTRAL_API_KEY && { name: "mistral", url: "https://api.mistral.ai/v1/chat/completions", key: process.env.MISTRAL_API_KEY, model: "ministral-8b-latest", extra: {} },
  process.env.OPENROUTER_API_KEY && { name: "openrouter", url: "https://openrouter.ai/api/v1/chat/completions", key: process.env.OPENROUTER_API_KEY, model: process.env.KAOS_OR_MODEL || "mistralai/ministral-8b", extra: {} },
].filter(Boolean);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
let bucket = { t: Date.now(), n: 0 };

async function llm(body) {
  const messages = [{ role: "system", content: String(body.system || "").slice(0, 4000) }]
    .concat((body.messages || []).slice(-8).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 400) })));
  for (const p of PROVIDERS) {
    try {
      const r = await fetch(p.url, { method: "POST", signal: AbortSignal.timeout(8000), headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({ model: p.model, messages, max_tokens: 400, temperature: 0.8, response_format: { type: "json_object" }, ...p.extra }) });
      if (!r.ok) continue;
      const j = await r.json();
      const content = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      if (content) return { provider: p.name, content };
    } catch (e) { /* fournisseur suivant */ }
  }
  return null;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/status") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ llm: PROVIDERS.length > 0, provider: PROVIDERS.map((p) => p.name).join(" → ") })); }
  if (url.pathname === "/api/npc" && req.method === "POST") {
    if (Date.now() - bucket.t > 60000) bucket = { t: Date.now(), n: 0 };
    if (++bucket.n > 40) { res.writeHead(429); return res.end("{}"); }
    let raw = ""; for await (const c of req) { raw += c; if (raw.length > 20000) break; }
    let out = null; try { out = await llm(JSON.parse(raw)); } catch (e) { /* */ }
    res.writeHead(out ? 200 : 503, { "Content-Type": "application/json" }); return res.end(JSON.stringify(out || { error: "llm indisponible" }));
  }
  const path = normalize(join(ROOT, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
  if (!path.startsWith(ROOT) || path.includes("node_modules")) { res.writeHead(403); return res.end(); }
  try { const data = await readFile(path); res.writeHead(200, { "Content-Type": TYPES[extname(path)] || "application/octet-stream" }); res.end(data); }
  catch (e) { res.writeHead(404); res.end("404"); }
}).listen(PORT, () => console.log(`Kaos sur http://localhost:${PORT}  (LLM : ${PROVIDERS.map((p) => p.name).join(" → ") || "aucun, mode script"})`));
