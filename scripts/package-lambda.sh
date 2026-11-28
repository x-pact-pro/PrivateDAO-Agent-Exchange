#!/usr/bin/env bash
set -euo pipefail

node scripts/provider-conformance-gate.mjs --surface lambda

OUTPUT_PATH=${1:-/tmp/privatedao-agent-exchange.zip}
PACKAGE_DIR=$(mktemp -d)
OUTPUT_DIR=$(dirname "$OUTPUT_PATH")
mkdir -p "$OUTPUT_DIR"
OUTPUT_TMP=$(mktemp "$OUTPUT_PATH.XXXXXX")
trap 'rm -rf "$PACKAGE_DIR"; rm -f "$OUTPUT_TMP"' EXIT

cp -R src assets package.json package-lock.json "$PACKAGE_DIR/"
cp -R vendor "$PACKAGE_DIR/"
cp -R scripts/browser "$PACKAGE_DIR/.browser"
mkdir -p "$PACKAGE_DIR/assets/browser"
test -f "$PACKAGE_DIR/assets/brand/privatedao-official-logo.jpg"
test -f "$PACKAGE_DIR/assets/brand/privatedao-official-banner.jpg"
test -f "$PACKAGE_DIR/assets/ecosystem/ibm-watsonx.svg"
test -f "$PACKAGE_DIR/assets/ecosystem/openvino.svg"
test -f "$PACKAGE_DIR/assets/ecosystem/mongodb.svg"
test -f "$PACKAGE_DIR/assets/ecosystem/github.svg"
test -f "$PACKAGE_DIR/assets/ecosystem/amd.png"
test -f "$PACKAGE_DIR/assets/ecosystem/ibm.svg"
test -f "$PACKAGE_DIR/assets/ecosystem/aws.svg"
test -f "$PACKAGE_DIR/assets/ecosystem/alibaba-cloud.svg"
test -f "$PACKAGE_DIR/assets/clients/openai-knot.svg"
test -f "$PACKAGE_DIR/assets/clients/claude-symbol.svg"
test -f "$PACKAGE_DIR/assets/clients/grok-symbol.svg"
test -f "$PACKAGE_DIR/assets/clients/openclaw-symbol.png"

(
  cd "$PACKAGE_DIR"
  # Backup/archive mounts may reject npm's executable symlinks; Lambda does
  # not need node_modules/.bin in the runtime bundle.
  npm ci --bin-links=false --ignore-scripts --no-audit --no-fund
  # npm represents local file dependencies as symlinks. Materialize the patched
  # code so zip packaging and Lambda extraction do not depend on symlink support.
  rm -f node_modules/elliptic
  cp -R vendor/elliptic node_modules/elliptic
  node -e 'const fs=require("node:fs"); const path=require("node:path"); const actual=fs.realpathSync(require.resolve("elliptic")); const expected=path.resolve("node_modules/elliptic/lib/elliptic.js"); const version=require("elliptic/package.json").version; if (actual !== expected || fs.lstatSync("node_modules/elliptic").isSymbolicLink() || version !== "6.6.2") throw new Error("patched elliptic dependency is missing from the Lambda package");'
  node_modules/esbuild/bin/esbuild .browser/solana-web3-entry.mjs --bundle --minify --format=esm --platform=browser --target=es2020 --outfile=assets/browser/solana-web3.mjs
  node_modules/esbuild/bin/esbuild .browser/spl-token-entry.mjs --bundle --minify --format=esm --platform=browser --target=es2020 --outfile=assets/browser/spl-token.mjs
  node_modules/esbuild/bin/esbuild .browser/8004-solana-entry.mjs --bundle --minify --format=esm --platform=browser --target=es2020 --external:crypto --external:node:fs --external:fs/promises --outfile=assets/browser/8004-solana.mjs
  rm -rf .browser
  npm prune --bin-links=false --omit=dev --ignore-scripts --no-audit --no-fund
  node --check src/handler.mjs
  node --input-type=module -e 'import("./src/handler.mjs").then(({ handler }) => { if (typeof handler !== "function") throw new Error("src/handler.handler export is missing"); })'
  test -s assets/browser/solana-web3.mjs
  test -s assets/browser/spl-token.mjs
  test -s assets/browser/8004-solana.mjs
  # npm prune can restore file-dependency symlinks; materialize again after it.
  rm -f node_modules/elliptic
  cp -R vendor/elliptic node_modules/elliptic
  node -e 'const fs=require("node:fs"); if (fs.lstatSync("node_modules/elliptic").isSymbolicLink() || require("elliptic/package.json").version !== "6.6.2") throw new Error("Lambda elliptic dependency is not materialized");'
  rm -f "$OUTPUT_TMP"
  zip -qr "$OUTPUT_TMP" src assets package.json package-lock.json vendor node_modules
)

test -s "$OUTPUT_TMP"
unzip -tq "$OUTPUT_TMP"
unzip -l "$OUTPUT_TMP" | awk '$NF == "src/handler.mjs" { handler = 1 } $NF == "vendor/elliptic/lib/elliptic/ec/index.js" { vendor = 1 } $NF == "node_modules/elliptic/lib/elliptic/ec/index.js" { elliptic = 1 } END { exit handler && vendor && elliptic ? 0 : 1 }'
mv -f "$OUTPUT_TMP" "$OUTPUT_PATH"
echo "Lambda package created: $OUTPUT_PATH"
