import { build } from "esbuild";
await build({ entryPoints: ["src/main.js"], bundle: true, format: "iife", outfile: "dist/kaos.js", target: "es2020", legalComments: "none" });
console.log("dist/kaos.js ok");
