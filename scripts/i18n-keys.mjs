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
  return [...keys].sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const keys = collectKeys();
  console.log(JSON.stringify(keys, null, 1));
  console.error(`${keys.length} keys`);
}
