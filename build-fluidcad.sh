#!/usr/bin/env bash
set -euo pipefail
#
# Build the FluidCAD-specific multi-threaded package from this branch on top of
# the libcascade release image, which already carries the compiled OCCT V8
# libraries, the generated + compiled bindings and the patched emsdk, so you
# don't need ./clone-deps.sh or a cold OCCT build. It mounts this branch's build
# config (build-configs/fluidcad_multi.yml + build-configs/fluidcad/*.cpp) into
# the image, links it, then bakes the deprecated-OCCT-name aliases and
# assembles a complete, npm-linkable package in ./dist/.
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

# The multi-threaded release image of the upstream version this branch sits on
# (`git merge-base fluidcad main` / the v<version> tag): bump the two together.
IMAGE="${IMAGE:-ghcr.io/taucad/opencascade.js:3.1.0-multi-threaded}"
YML="build-configs/fluidcad_multi.yml"
OUT="${OUT:-$(pwd)/dist}"
CPUS="${CPUS:-$(nproc 2>/dev/null || echo 8)}"

[ -f "$YML" ] || { echo "Error: $YML not found (are you on the fluidcad branch?)" >&2; exit 1; }
mkdir -p "$OUT"

# The image's emsdk already carries the libembind overload-dispatch patch
# (`build-wasm.sh apply-patches` runs in its bindgen stage, see Dockerfile);
# the container checks it against the expected post-patch digest before building
# so an image cut against another emsdk fails fast instead of linking quietly.
LIBEMBIND_SHA="$(cat src/patches/libembind-overloading.expected.sha256)"

echo "=== Image:  $IMAGE"
echo "=== Config: $YML ($(grep -c 'symbol:' "$YML") symbols)  ->  $OUT"
echo

# Only `link` runs: the release image ships the compiled binding object for
# every OCCT header plus its .d.ts.json fragment, and the link step itself
# parses + compiles the hand-written wrappers (additionalCppFiles). `generate`
# and `bindings` must NOT run here — the image prunes the generated .cpp
# sources, so compileBindings.py would see nothing to build and delete every
# object instead.
docker run --rm \
  --cpus="$CPUS" \
  -e OCJS_CONFIG=multi-threaded \
  -e OCJS_OUTPUT_DIR=/out \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v "$OUT:/out" \
  -v "$(pwd)/$YML:/opencascade.js/$YML:ro" \
  -v "$(pwd)/build-configs/fluidcad:/opencascade.js/build-configs/fluidcad:ro" \
  -v "$(pwd)/fluidcad-pkg:/pkg:ro" \
  --entrypoint bash \
  "$IMAGE" -c "
    set -e
    echo '$LIBEMBIND_SHA  /emsdk/upstream/emscripten/src/lib/libembind.js' | sha256sum -c --quiet \
      || { echo 'Error: the image libembind.js is not the patched one src/patches/libembind-overloading.expected.sha256 records' >&2; exit 1; }
    cd /opencascade.js
    ./build-wasm.sh --config multi-threaded link '$YML'

    # --- Bake deprecated-OCCT-name aliases + assemble the package ---
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
