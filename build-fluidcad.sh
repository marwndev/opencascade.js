#!/usr/bin/env bash
set -euo pipefail
#
# Build the FluidCAD-specific multi-threaded package from this branch, reusing the
# prebuilt deps (OCCT / emsdk / freetype / rapidjson) baked into the V8 image so
# you don't need ./clone-deps.sh. It mounts this branch's bindgen sources over
# the image and runs generate -> compile-bindings -> link for
# build-configs/fluidcad_multi.yml, then bakes the deprecated-OCCT-name aliases
# and assembles a complete, npm-linkable package in ./fluidcad-dist/.
#
# Output package (fluidcad-dist/) — matches package.json `exports`:
#   index.js / index.d.ts                          (entry: applies aliases at runtime)
#   aliases.generated.js / .json                   (deprecated -> canonical map)
#   opencascade.fluidcad.multi-threaded.{js,wasm,d.ts}   (raw module; d.ts alias-baked)
#
# Usage:
#   ./build-fluidcad.sh                 # outputs to ./fluidcad-dist/
#   OUT=/path ./build-fluidcad.sh  CPUS=8 ./build-fluidcad.sh  IMAGE=… ./build-fluidcad.sh
#
# Native alternative (downloads deps, no Docker mounts; does NOT alias/package):
#   ./clone-deps.sh && ./build-wasm.sh --config multi-threaded full build-configs/fluidcad_multi.yml

cd "$(dirname "$0")"

IMAGE="${IMAGE:-ghcr.io/taucad/opencascade.js:multi-threaded-branch-occt-v8-emscripten-5}"
YML="build-configs/fluidcad_multi.yml"
OUT="${OUT:-$(pwd)/fluidcad-dist}"
CPUS="${CPUS:-$(nproc 2>/dev/null || echo 8)}"

[ -f "$YML" ] || { echo "Error: $YML not found (are you on the fluidcad branch?)" >&2; exit 1; }
mkdir -p "$OUT"

# The libembind overload-table fix is committed as a patch (src/patches/...).
# Re-derive the patched libembind.js from the vendored pristine snapshot and mount
# it (equivalent to `build-wasm.sh apply-patches`, but without re-running the
# OCCT-patch / PCH steps the image already carries).
EMBIND="$(mktemp)"
cp src/vendor/pristine-libembind.js "$EMBIND"
patch -s "$EMBIND" < src/patches/libembind-overloading.patch
trap 'rm -f "$EMBIND"' EXIT

echo "=== Image:  $IMAGE"
echo "=== Config: $YML ($(grep -c 'symbol:' "$YML") symbols)  ->  $OUT"
echo

docker run --rm \
  --cpus="$CPUS" \
  -e OCJS_CONFIG=multi-threaded \
  -e OCJS_OUTPUT_DIR=/out \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v "$OUT:/out" \
  -v "$(pwd)/src/ocjs_bindgen/discover.py:/opencascade.js/src/ocjs_bindgen/discover.py:ro" \
  -v "$(pwd)/src/ocjs_bindgen/ast/template_args.py:/opencascade.js/src/ocjs_bindgen/ast/template_args.py:ro" \
  -v "$(pwd)/bindgen-filters.yaml:/opencascade.js/bindgen-filters.yaml:ro" \
  -v "$(pwd)/$YML:/opencascade.js/$YML:ro" \
  -v "$(pwd)/fluidcad-pkg:/pkg:ro" \
  -v "$EMBIND:/emsdk/upstream/emscripten/src/lib/libembind.js:ro" \
  --entrypoint bash \
  "$IMAGE" -c "
    set -e
    cd /opencascade.js
    ./build-wasm.sh --config multi-threaded generate bindings link '$YML'

    # --- Bake deprecated-OCCT-name aliases (Workstream B) + assemble the package ---
    # Done in-container so the (root-owned) build .d.ts is writable and the alias
    # outputs share the build's ownership; final chown hands everything back to you.
    cp build/ncollection-manifest.json /out/ncollection-manifest.json
    node /pkg/gen-aliases.mjs \
      --manifest /out/ncollection-manifest.json \
      --dts /out/opencascade.fluidcad.multi-threaded.d.ts \
      --out /out
    cp /pkg/index.js /pkg/index.d.ts /out/
    chown -R \"\${HOST_UID}:\${HOST_GID}\" /out 2>/dev/null || true
  "

echo
echo "=== Build complete — package in $OUT ==="
ls -lh "$OUT" 2>/dev/null | grep -E 'index\.|aliases|multi-threaded\.(js|wasm|d\.ts)' || ls -lh "$OUT"
