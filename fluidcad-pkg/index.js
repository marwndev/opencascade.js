// index.js — package entry for the custom multi-threaded OCCT V8 build.
//
// Thin ESM wrapper around the generated module. It initializes the raw OCCT V8
// instance, then restores deprecated OCCT type names (TopTools_ListOfShape,
// TColgp_Array1OfPnt, TopoDS_ListOfShape, …) as aliases of their V8 canonical
// (mangled) classes — e.g. NCollection_List_TopoDS_Shape.
//
// Aliasing is purely runtime: the alias and the canonical share ONE constructor
// object, so `new oc.TopTools_ListOfShape()` and `instanceof` work for either
// spelling, and a value returned by the API under its canonical type still passes
// `instanceof oc.TopTools_ListOfShape`. (We can't register a second embind class_<>
// for the same C++ type — that aborts Module() init with "Cannot register type
// twice"; see FORK_PLAN.md §5.)
//
// Consumers who want the un-aliased module can import "<pkg>/raw".

import rawInit from "./opencascade.fluidcad.multi-threaded.js";
import ALIASES from "./aliases.generated.js";

/**
 * Initialize the OCCT V8 WASM module with deprecated OCCT type names restored.
 * @param {Record<string, unknown>} [options] Emscripten Module overrides (e.g. `locateFile`).
 * @returns {Promise<any>} the initialized instance (canonical + deprecated names).
 */
export default async function init(options) {
  const oc = await rawInit(options);
  for (const alias in ALIASES) {
    const canonical = ALIASES[alias];
    if (oc[alias] === undefined && oc[canonical] !== undefined) {
      oc[alias] = oc[canonical];
    }
  }
  return oc;
}
