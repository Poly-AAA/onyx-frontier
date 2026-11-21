/** Bundle local minifié ; le wasm Rapier est sorti du JS (base64) vers assets/rapier.wasm pour tenir le budget JS. */
import { build } from "esbuild";
import { copyFileSync, statSync, readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { minify } from "terser";
copyFileSync("node_modules/@dimforge/rapier3d-compat/dist/rapier_wasm3d_bg.wasm", "assets/rapier.wasm");
const wasmOut = {
  name: "rapier-wasm-out",
  setup(b) {
    b.onLoad({ filter: /rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/ }, async (a) => {
      const { readFile } = await import("node:fs/promises");
      let s = await readFile(a.path, "utf8");
      const i = s.indexOf('toByteArray("AGFzbQ'), st = s.lastIndexOf("module_or_path:", i), end0 = s.indexOf('")', i) + 2, end = s.startsWith(".buffer", end0) ? end0 + 7 : end0;
      if (i < 0 || st < 0) throw new Error("motif wasm Rapier introuvable");
      s = s.slice(0, st) + 'module_or_path:new URL("assets/rapier.wasm",document.baseURI)' + s.slice(end);
      return { contents: s, loader: "js" };
    });
  },
};
// dist/ = sortie générée : on retire les anciens chunks (sinon le total compte des fichiers périmés)
if (existsSync("dist")) for (const f of readdirSync("dist")) if (f.endsWith(".js")) rmSync("dist/" + f);
await build({ entryPoints: ["src/main.js"], bundle: true, format: "esm", minify: true, splitting: true, outdir: "dist", entryNames: "ow", chunkNames: "chunk-[hash]", target: "es2022", legalComments: "none", drop: ["console", "debugger"], plugins: [wasmOut] });
// passe terser (élimine le code mort restant) : total JS ≤ 1,5 Mo
let total = 0;
for (const f of readdirSync("dist").filter((f) => f.endsWith(".js"))) {
  const r = await minify(readFileSync("dist/" + f, "utf8"), { module: true, ecma: 2020, compress: { passes: 2 }, mangle: true });
  writeFileSync("dist/" + f, r.code); total += r.code.length;
}
console.log("JS total", (total / 1e6).toFixed(2), "Mo");
console.log("dist/ow.js", (statSync("dist/ow.js").size / 1e6).toFixed(2), "Mo ; assets/rapier.wasm", (statSync("assets/rapier.wasm").size / 1e6).toFixed(2), "Mo");
