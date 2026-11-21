// Outil d'orchestration (assistant) : fait réécrire une plage de lignes par un modèle, recolle mécaniquement.
// Usage: node tools/patch.mjs <model> <srcFile> <start> <end> <instructionsFile> <outFile> [maxTokens]
import fs from 'node:fs';
const [model, src, s, e, instrF, out, maxTok='4000'] = process.argv.slice(2);
if (fs.existsSync(out)) { console.error('REFUS: existe ' + out); process.exit(2); }
const lines = fs.readFileSync(src, 'utf8').split('\n');
const chunk = lines.slice(+s - 1, +e).join('\n');
const prompt = fs.readFileSync(instrF, 'utf8') + '\n\n=== CODE TO REWRITE (lines ' + s + '-' + e + ' of the file; return ONLY the replacement for exactly this region, same indentation, as one javascript code block) ===\n```javascript\n' + chunk + '\n```';
const sys = 'You are a senior JavaScript engineer fixing code. Output ONLY one fenced ```javascript code block with the replacement code, no explanation.';
let j, res, t0;
for (let attempt = 0; attempt < 4; attempt++) {
  t0 = Date.now();
  res = await fetch('http://localhost:20128/v1/chat/completions', {method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({model, max_tokens:+maxTok, temperature:0.2, messages:[{role:'system',content:sys},{role:'user',content:prompt}]})});
  j = await res.json();
  if (res.status === 429 || (j.error && /rate|TPM|per minute/i.test(j.error.message||''))) { const w = Math.min(90, (+j.error?.reset_seconds || (typeof j.error?.retry_after === "number" ? j.error.retry_after : 30))) + 2; console.error('rate limit, attente', w, 's'); await new Promise(r=>setTimeout(r, w*1000)); continue; }
  break;
}
const rawF = 'raw/' + out.split('/').pop() + '.L' + s + '-' + e + '.' + model.replace(/[^a-z0-9.-]+/gi,'_') + '.json';
fs.writeFileSync(rawF, JSON.stringify({model, status:res.status, ms:Date.now()-t0, usage:j.usage, finish:j.choices?.[0]?.finish_reason, prompt, content:j.choices?.[0]?.message?.content, error:j.error}, null, 1));
const c = j.choices?.[0]?.message?.content || '';
const m = c.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
if (!m) { console.error('PAS DE BLOC', res.status, JSON.stringify(j.error||j.choices?.[0]?.finish_reason)); process.exit(1); }
const outLines = lines.slice(0, +s - 1).concat(m[1].replace(/\n$/, '').split('\n'), lines.slice(+e));
fs.writeFileSync(out, outLines.join('\n'));
console.log(JSON.stringify({model, status:res.status, usage:j.usage, finish:j.choices?.[0]?.finish_reason, newLines:m[1].split('\n').length}));
