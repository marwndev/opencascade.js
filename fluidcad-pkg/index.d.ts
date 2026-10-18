// index.d.ts — types for the package entry (see index.js).
//
// The build's monolithic .d.ts is self-aliasing: gen-aliases bakes the deprecated
// OCCT name aliases (TopTools_ListOfShape, TopoDS_ListOfShape, math_Vector, …) into
// it directly — both `export type <alias> = <canonical>` and the matching
// `OpenCascadeInstance` constructor members — so re-exporting it surfaces both the
// canonical and the deprecated names. The wrapper (index.js) applies the matching
// aliases on the module object at runtime.

import type { OpenCascadeInstance } from "./opencascade.fluidcad.multi-threaded.js";

// Canonical classes, enums, the (alias-augmented) OpenCascadeInstance, the
// deprecated-name `export type` aliases, FS, OCJS, … (everything but `init`).
export * from "./opencascade.fluidcad.multi-threaded.js";

/** Options for {@link init}: Emscripten Module overrides plus the worker pool size. */
export interface InitOptions extends Record<string, unknown> {
  /**
   * pthread workers to pre-spawn for OCCT's parallel algorithms (booleans, meshing).
   * Defaults to one per logical CPU. When set (>= 1), OCCT's default thread pool is
   * capped at the same count, so OCCT never asks for more threads than the pool holds.
   * `OSD_ThreadPool.DefaultPool().Init(n)` changes OCCT's count later. The pre-spawned
   * workers stay for the life of the instance; raising the count past them spawns more
   * on demand under Node, but can deadlock a browser.
   */
  pthreadPoolSize?: number;
}

/**
 * Initialize the multi-threaded OCCT V8 module. The returned instance exposes the
 * canonical (mangled) classes AND the restored deprecated OCCT names.
 * @param options Emscripten Module overrides (e.g. `locateFile`) and `pthreadPoolSize`.
 */
export default function init(options?: InitOptions): Promise<OpenCascadeInstance>;
