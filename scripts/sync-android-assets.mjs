import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "web");
const to = path.join(root, "android", "app", "src", "main", "assets", "www");

fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });
copyDir(from, to);
console.log("synced web -> " + to);

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name.startsWith(".")) continue;
    const a = path.join(src, name);
    const b = path.join(dest, name);
    if (fs.statSync(a).isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}
