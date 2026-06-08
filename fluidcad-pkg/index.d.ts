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

/**
 * Initialize the multi-threaded OCCT V8 module. The returned instance exposes the
 * canonical (mangled) classes AND the restored deprecated OCCT names.
 * @param options Emscripten Module overrides (e.g. `locateFile`).
 */
export default function init(options?: Record<string, unknown>): Promise<OpenCascadeInstance>;
