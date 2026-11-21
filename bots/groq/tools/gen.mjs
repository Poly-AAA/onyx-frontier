// Outil d'orchestration (écrit par l'assistant, pas du code de jeu) :
// envoie un prompt à un modèle via OmniRoute local et sauvegarde la réponse brute + le code extrait.
// Usage: node tools/gen.mjs <model> <promptFile> <outCodeFile> [maxTokens]
import fs from 'node:fs';
const [model, promptFile, outFile, maxTok='16000'] = process.argv.slice(2);
if (fs.existsSync(outFile)) { console.error('REFUS: ' + outFile + ' existe déjà (pas d\'écrasement)'); process.exit(2); }
const prompt = fs.readFileSync(promptFile, 'utf8');
const sys = 'You are a senior JavaScript engineer. Output ONLY one fenced code block containing the complete file, no explanation.';
const t0 = Date.now();
const res = await fetch('http://localhost:20128/v1/chat/completions', {method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({model, max_tokens: +maxTok, temperature: 0.2, messages:[{role:'system',content:sys},{role:'user',content:prompt}]})});
const j = await res.json();
const base = 'raw/' + outFile.split('/').pop() + '.' + model.replace(/[^a-z0-9.-]+/gi,'_');
fs.writeFileSync(base + '.json', JSON.stringify({model, status:res.status, ms:Date.now()-t0, usage:j.usage, finish:j.choices?.[0]?.finish_reason, content:j.choices?.[0]?.message?.content, error:j.error}, null, 1));
const c = j.choices?.[0]?.message?.content || '';
const m = c.match(/```(?:javascript|js|markdown|md|html)?\s*\n([\s\S]*?)```/);
if (!m) { console.error('PAS DE BLOC DE CODE', res.status, JSON.stringify(j.error||j.choices?.[0]?.finish_reason)); process.exit(1); }
fs.writeFileSync(outFile, m[1]);
console.log(JSON.stringify({model, status:res.status, ms:Date.now()-t0, usage:j.usage, finish:j.choices?.[0]?.finish_reason, lines:m[1].split('\n').length}));
