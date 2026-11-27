// Collects every Russian UI string (the i18n keys) from the source tree.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SKIP = new Set(["i18n", "engine"]);
function walk(dir, out = []) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) {
      if (!SKIP.has(f)) walk(p, out);
    } else if (/\.(ts|tsx)$/.test(f)) out.push(p);
  }
  return out;
}

export function collectKeys(root = new URL("../src", import.meta.url).pathname) {
  const keys = new Set();
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !/^\s*\/\//.test(l) && !/logAction\(/.test(l) && !/console\./.test(l))
      .join("\n");
    for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*[А-Яа-яЁё](?:[^"\\\n]|\\.)*)"/g)) keys.add(m[1].replace(/\\"/g, '"'));
  }
  for (const k of [...keys]) if (/^, .: $/.test(k) || /insert into|select |values \(/i.test(k)) keys.delete(k);
  // Group names are stored in the DB as "Группа A"; rendered via this template.
  keys.add("Группа {letter}");
  // Rank tier names live in the pure engine (src/lib/engine/elo.ts), which is not scanned.
  for (const m of readFileSync(join(root, "lib/engine/elo.ts"), "utf8").matchAll(/name: "([^"]+)"/g)) keys.add(m[1]);
  // Series validation messages (src/lib/engine/results.ts) are shown to players via FormError.
  for (const m of readFileSync(join(root, "lib/engine/results.ts"), "utf8").matchAll(/error: "([^"]+)"/g)) keys.add(m[1]);
  // Achievement names and descriptions (src/lib/engine/achievements.ts).
  for (const m of readFileSync(join(root, "lib/engine/achievements.ts"), "utf8").matchAll(/(?:name|desc): "([^"]+)"/g)) keys.add(m[1]);
  // Card frame names (src/lib/engine/levels.ts).
  for (const m of readFileSync(join(root, "lib/engine/levels.ts"), "utf8").matchAll(/name: "([^"]+)"/g)) keys.add(m[1]);
  // Shop tags and titles (src/lib/engine/shop.ts).
  for (const m of readFileSync(join(root, "lib/engine/shop.ts"), "utf8").matchAll(/"([^"]*[А-Яа-яЁё][^"]*)"/g)) keys.add(m[1]); // only Russian strings (descriptions, labels); item names stay English
  for (const m of readFileSync(join(root, "lib/engine/pass.ts"), "utf8").matchAll(/"([^"]*[А-Яа-яЁё][^"]*)"/g)) keys.add(m[1]);
  // Commentary headlines (src/lib/engine/commentary.ts).
  for (const m of readFileSync(join(root, "lib/engine/commentary.ts"), "utf8").matchAll(/text: "([^"]+)"/g)) keys.add(m[1]);
  return [...keys].sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = collectKeys();
  console.log(JSON.stringify(keys, null, 1));
  console.error(`${keys.length} keys`);
}
