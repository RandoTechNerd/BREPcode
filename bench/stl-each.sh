#!/usr/bin/env bash
# Run the STL bench one file per process with a time cap, so a conversion that
# never returns costs CAP seconds and a "timeout" row instead of the whole run.
#   bench/stl-each.sh list.txt out.json CAP_SECONDS -- <kernel-bench args, e.g. --kernel native>
# Kernel env vars (BREPCODE_RUST_KERNEL_DIR, BREPCODE_NATIVE_KERNEL) pass through.
set -u
LIST=$1; OUT=$2; CAP=$3; shift 4
TMP=$(mktemp -d)
i=0
while IFS= read -r f || [ -n "$f" ]; do
  f=${f%$'\r'}; [ -z "$f" ] && continue; [ "${f:0:1}" = "#" ] && continue
  i=$((i+1)); printf '%s\n' "$f" > "$TMP/l$i.txt"
  start=$(date +%s)
  timeout -k 10 "$CAP" node bench/kernel-bench.mjs stl --list "$TMP/l$i.txt" --out "$TMP/r$i.json" "$@" > "$TMP/o$i.txt" 2>&1
  code=$?
  if [ ! -s "$TMP/r$i.json" ]; then
    printf '{"timeout":true,"file":%s,"code":%d,"seconds":%d}\n' "$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$f")" "$code" "$(( $(date +%s) - start ))" > "$TMP/r$i.json"
    echo "TIME $(basename "$f") no result after $(( $(date +%s) - start )) s (exit $code)"
  else
    grep -E "^(ok|FAIL)" "$TMP/o$i.txt"
  fi
done < "$LIST"
node -e '
const fs = require("fs"), path = require("path");
const [dir, n, out, cap] = process.argv.slice(1);
let meta = null; const results = [];
for (let i = 1; i <= +n; i++) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, `r${i}.json`), "utf8"));
  if (j.timeout) results.push({ id: path.basename(j.file), file: j.file, ok: false, timeout: true, ms: null,
    error: `no result after ${j.seconds} s (stopped at the ${cap} s cap)` });
  else { meta ??= j.meta; results.push(...j.results); }
}
fs.writeFileSync(out, JSON.stringify({ meta: { ...(meta || {}), capSeconds: +cap, perFileProcess: true }, results }, null, 1));
console.log(`wrote ${out} (${results.length} cases)`);
' "$TMP" "$i" "$OUT" "$CAP"
rm -rf "$TMP"
