import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const scannedExtensions = new Set([".mjs", ".js", ".json", ".yml", ".yaml", ".sh"]);
const ignoredDirectories = new Set([".git", "node_modules", "coverage", "dist", "out"]);
const forbiddenPatterns = [
  /packages[\\/]privatedao-runtime/,
  /privatedao-runtime[\\/]src/,
  /(?:^|[\\/])\.\.[\\/]packages[\\/]/,
  /PDAO_KERNEL_/,
  /kernel:\/\//,
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
      files.push(...await walk(join(directory, entry.name)));
    } else if (entry.isFile() && scannedExtensions.has(extname(entry.name))) {
      files.push(join(directory, entry.name));
    }
  }
  return files;
}

const violations = [];
for (const file of await walk(root)) {
  if (relative(root, file) === "scripts/verify-kernel-boundary.mjs") continue;
  const contents = await readFile(file, "utf8");
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(contents)) violations.push(`${relative(root, file)} matches ${pattern}`);
  }
}

if (violations.length) {
  console.error("Kernel boundary violation:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Kernel boundary: PASS (no direct Kernel implementation dependency)");
