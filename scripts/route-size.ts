// Server bundle size of one route: its entry file plus every chunk it loads.
//   npx tsx scripts/route-size.ts .next-e2e api/chat
import { readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const [dist = ".next", route = "api/chat"] = process.argv.slice(2);
const entry = join(dist, "server/app", route, "route.js");
const src = readFileSync(entry, "utf8");
const chunks = [...src.matchAll(/R\.c\("([^"]+)"\)/g)].map((m) => join(dist, m[1]));
const files = [entry, ...chunks];
const raw = files.reduce((n, f) => n + statSync(f).size, 0);
const gz = files.reduce((n, f) => n + gzipSync(readFileSync(f)).length, 0);
console.log(JSON.stringify({ route, files: files.length, rawKB: Math.round(raw / 1024), gzipKB: Math.round(gz / 1024) }));
