#!/usr/bin/env bash
set -euo pipefail
#
# Build the FluidCAD-specific multi-threaded package from this branch, reusing the
# prebuilt deps (OCCT / emsdk / freetype / rapidjson) baked into the V8 image so
# you don't need ./clone-deps.sh. It mounts this branch's bindgen sources over
# the image and runs generate -> compile-bindings -> link for
# build-configs/fluidcad_multi.yml, then bakes the deprecated-OCCT-name aliases
# and assembles a complete, npm-linkable package in ./dist/.
#
# Output package (dist/) — matches package.json `exports`:
#   index.js / index.d.ts                          (entry: applies aliases at runtime)
#   aliases.generated.js / .json                   (deprecated -> canonical map)
#   opencascade.fluidcad.multi-threaded.{js,wasm,d.ts}   (raw module; d.ts alias-baked)
#
# Usage:
#   ./build-fluidcad.sh                 # outputs to ./dist/
#   OUT=/path ./build-fluidcad.sh  CPUS=8 ./build-fluidcad.sh  IMAGE=… ./build-fluidcad.sh
#
# Native alternative (downloads deps, no Docker mounts; does NOT alias/package):
#   ./clone-deps.sh && ./build-wasm.sh --config multi-threaded full build-configs/fluidcad_multi.yml

cd "$(dirname "$0")"

IMAGE="${IMAGE:-ghcr.io/taucad/opencascade.js:multi-threaded-branch-occt-v8-emscripten-5}"
YML="build-configs/fluidcad_multi.yml"
OUT="${OUT:-$(pwd)/dist}"
CPUS="${CPUS:-$(nproc 2>/dev/null || echo 8)}"

[ -f "$YML" ] || { echo "Error: $YML not found (are you on the fluidcad branch?)" >&2; exit 1; }
mkdir -p "$OUT"

# class_.py is mounted for the raw_destructor fix: the image's generator emitted a
# no-op destructor for every class using OCCT's DEFINE_STANDARD_ALLOC (its placement
# operator delete tripped the "placement delete" rule), so .delete() never freed
# gp_*/Bnd_*/TopoDS_Shape/NCollection_*/BRep*API_* objects. See
# src/ocjs_bindgen/codegen/embind/class_.py (process_class, raw_destructor section).
#
# The libembind overload-table fix is committed as a patch (src/patches/...).
# Re-derive the patched libembind.js from the vendored pristine snapshot and mount
# it (equivalent to `build-wasm.sh apply-patches`, but without re-running the
# OCCT-patch / PCH steps the image already carries).
EMBIND="$(mktemp)"
cp src/vendor/pristine-libembind.js "$EMBIND"
patch -s "$EMBIND" < src/patches/libembind-overloading.patch

# pthread workers skip Embind initialization (src/patches/pthread-worker-no-embind.patch):
# they only run OCCT's OSD_ThreadPool jobs, and a per-worker copy of the registry
# costs each worker tens of MB. Unlike libembind it is swapped in inside the
# container, after checking the image still ships the pristine it was cut against.
PTHREAD_RT="$(mktemp)"
cp src/vendor/pristine-runtime_pthread.js "$PTHREAD_RT"
patch -s "$PTHREAD_RT" < src/patches/pthread-worker-no-embind.patch
PTHREAD_RT_SHA="$(cat src/vendor/pristine-runtime_pthread.expected.sha256)"
trap 'rm -f "$EMBIND" "$PTHREAD_RT"' EXIT

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
  -v "$(pwd)/src/ocjs_bindgen/codegen/embind/class_.py:/opencascade.js/src/ocjs_bindgen/codegen/embind/class_.py:ro" \
  -v "$(pwd)/bindgen-filters.yaml:/opencascade.js/bindgen-filters.yaml:ro" \
  -v "$(pwd)/$YML:/opencascade.js/$YML:ro" \
  -v "$(pwd)/fluidcad-pkg:/pkg:ro" \
  -v "$EMBIND:/emsdk/upstream/emscripten/src/lib/libembind.js:ro" \
  -v "$PTHREAD_RT:/patched/runtime_pthread.js:ro" \
  --entrypoint bash \
  "$IMAGE" -c "
    set -e
    echo '$PTHREAD_RT_SHA  /emsdk/upstream/emscripten/src/runtime_pthread.js' | sha256sum -c --quiet \
      || { echo 'Error: the image runtime_pthread.js is not the pristine src/patches/pthread-worker-no-embind.patch was cut against' >&2; exit 1; }
    cp /patched/runtime_pthread.js /emsdk/upstream/emscripten/src/runtime_pthread.js
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
