#!/usr/bin/env bash
set -euo pipefail
#
# Build the FluidCAD-specific multi-threaded WASM from this branch, reusing the
# prebuilt deps (OCCT / emsdk / freetype / rapidjson) baked into the V8 image so
# you don't need ./clone-deps.sh. It mounts this branch's bindgen sources over
# the image and runs generate -> compile-bindings -> link for
# build-configs/fluidcad_multi.yml.
#
# Usage:
#   ./build-fluidcad.sh                 # outputs to ./fluidcad-dist/
#   OUT=/path/to/out ./build-fluidcad.sh
#   CPUS=8 ./build-fluidcad.sh
#   IMAGE=ghcr.io/<org>/opencascade.js:<tag> ./build-fluidcad.sh
#
# Native alternative (downloads deps, no Docker mounts):
#   ./clone-deps.sh && ./build-wasm.sh --config multi-threaded full \
#       build-configs/fluidcad_multi.yml
#
# NOTE: this produces the raw FluidCAD WASM + .d.ts. The deprecated-OCCT-name
# aliasing (TopTools_ListOfShape, ...) is a downstream packaging step and lives
# in the consumer repo, not here.

cd "$(dirname "$0")"

IMAGE="${IMAGE:-ghcr.io/taucad/opencascade.js:multi-threaded-branch-occt-v8-emscripten-5}"
YML="build-configs/fluidcad_multi.yml"
OUT="${OUT:-$(pwd)/fluidcad-dist}"
CPUS="${CPUS:-$(nproc 2>/dev/null || echo 8)}"

[ -f "$YML" ] || { echo "Error: $YML not found (are you on the fluidcad branch?)" >&2; exit 1; }
mkdir -p "$OUT"

# The libembind overload-table fix is committed as a patch (src/patches/...).
# Re-derive the patched libembind.js from the vendored pristine snapshot and
# mount it (equivalent to `build-wasm.sh apply-patches`, but without re-running
# the OCCT-patch / PCH steps the image already carries).
EMBIND="$(mktemp)"
cp src/vendor/pristine-libembind.js "$EMBIND"
patch -s "$EMBIND" < src/patches/libembind-overloading.patch
trap 'rm -f "$EMBIND"' EXIT

echo "=== Image:  $IMAGE"
echo "=== Config: build-configs/fluidcad_multi.yml ($(grep -c 'symbol:' "$YML") symbols)  ->  $OUT"
echo

docker run --rm \
  --cpus="$CPUS" \
  -e OCJS_CONFIG=multi-threaded \
  -e OCJS_OUTPUT_DIR=/out \
  -v "$OUT:/out" \
  -v "$(pwd)/src/ocjs_bindgen/discover.py:/opencascade.js/src/ocjs_bindgen/discover.py:ro" \
  -v "$(pwd)/src/ocjs_bindgen/ast/template_args.py:/opencascade.js/src/ocjs_bindgen/ast/template_args.py:ro" \
  -v "$(pwd)/bindgen-filters.yaml:/opencascade.js/bindgen-filters.yaml:ro" \
  -v "$(pwd)/$YML:/opencascade.js/$YML:ro" \
  -v "$EMBIND:/emsdk/upstream/emscripten/src/lib/libembind.js:ro" \
  --entrypoint bash \
  "$IMAGE" -c "
    set -e
    cd /opencascade.js
    ./build-wasm.sh --config multi-threaded generate bindings link '$YML'
  "

echo
echo "=== Build complete — artifacts in $OUT ==="
ls -lh "$OUT" 2>/dev/null || true
