// Exercises the curated package (not the separate upstream/full WASM build).
// Run after build-fluidcad.sh: node scripts/check-fluidcad-self-interference.mjs
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import init from '../dist/index.js';

async function main() {
  const dist = new URL('../dist/', import.meta.url);
  const oc = await init({ locateFile: name => fileURLToPath(new URL(name, dist)) });
  const owned = [];
  const keep = value => { owned.push(value); return value; };
  try {
    for (const name of ['BRepAlgoAPI_Check', 'BOPAlgo_ArgumentAnalyzer', 'BOPAlgo_CheckResult',
      'BOPAlgo_ArgumentAnalyzerExt', 'NCollection_List_BOPAlgo_CheckResult']) {
      assert.equal(typeof oc[name], 'function', `${name} must be linked and constructable`);
    }
    assert.ok(oc.BOPAlgo_CheckStatus.BOPAlgo_SelfIntersect);
    assert.ok(oc.BOPAlgo_Operation.BOPAlgo_CUT);

    const progress = keep(new oc.Message_ProgressRange());
    const cylinder = keep(new oc.BRepPrimAPI_MakeCylinder(2, 5));
    const shape = keep(cylinder.Shape());
    const checker = keep(new oc.BRepAlgoAPI_Check(shape, false, true, progress));
    assert.equal(checker.HasErrors(), false);
    assert.equal(checker.IsValid(), true, 'a simple cylinder must be accepted');
    const cleanResults = keep(checker.Result());
    assert.equal(cleanResults.IsEmpty(), true);

    // Two individually valid, overlapping solids form a topologically valid
    // compound with interfering faces. This separates the self-interference
    // check from BRepCheck_Analyzer and exercises diagnostic result containers.
    const point = keep(new oc.gp_Pnt(1, 0, 1));
    const direction = keep(new oc.gp_Dir(0, 0, 1));
    const axis = keep(new oc.gp_Ax2(point, direction));
    const secondCylinder = keep(new oc.BRepPrimAPI_MakeCylinder(axis, 2, 5));
    const secondShape = keep(secondCylinder.Shape());
    const compound = keep(new oc.TopoDS_Compound());
    const builder = keep(new oc.BRep_Builder());
    builder.MakeCompound(compound);
    builder.Add(compound, shape);
    builder.Add(compound, secondShape);
    const topology = keep(new oc.BRepCheck_Analyzer(compound, true, false));
    assert.equal(topology.IsValid(), true, 'fixture must be topologically valid');

    checker.SetData(compound, false, true);
    checker.Perform(progress);
    assert.equal(checker.HasErrors(), false);
    assert.equal(checker.IsValid(), false, 'overlapping members must fail the self-interference check');
    const faults = keep(checker.Result());
    assert.ok(faults.Size() > 0, 'diagnostics must be readable');
    const fault = keep(faults.First());
    assert.equal(fault.GetCheckStatus(), oc.BOPAlgo_CheckStatus.BOPAlgo_SelfIntersect);
    const faultyShapes = keep(fault.GetFaultyShapes1());
    assert.ok(faultyShapes.Size() > 0, 'diagnostics must identify faulty subshapes');
    const ancestor = keep(fault.GetShape1());
    assert.equal(ancestor.IsSame(compound), true);

    // The overload taking two shapes must remain usable: overlapping arguments
    // are valid for CUT even though their union-as-an-unfused-compound fails SI.
    checker.SetData(shape, secondShape, oc.BOPAlgo_Operation.BOPAlgo_CUT, false, true);
    checker.Perform(progress);
    assert.equal(checker.HasErrors(), false);
    assert.equal(checker.IsValid(), true);

    const analyzer = keep(new oc.BOPAlgo_ArgumentAnalyzer());
    analyzer.SetShape1(compound);
    assert.equal(analyzer.SelfInterMode(), false);
    analyzer.Perform(progress);
    assert.equal(analyzer.HasFaulty(), false, 'a default analyzer enables no checks');
    oc.BOPAlgo_ArgumentAnalyzerExt.SetSelfInterMode(analyzer, true);
    assert.equal(analyzer.SelfInterMode(), true);
    analyzer.Perform(progress);
    assert.equal(analyzer.HasErrors(), false);
    assert.equal(analyzer.HasFaulty(), true, 'the native analyzer must run its enabled SI check');
    const analyzerResults = keep(analyzer.GetCheckResult());
    const analyzerFault = keep(analyzerResults.First());
    assert.equal(analyzerFault.GetCheckStatus(), oc.BOPAlgo_CheckStatus.BOPAlgo_SelfIntersect);

    const modes = keep(new oc.BOPAlgo_ArgumentAnalyzer());
    for (const name of ['StopOnFirstFaulty', 'ArgumentTypeMode', 'SelfInterMode', 'SmallEdgeMode',
      'RebuildFaceMode', 'TangentMode', 'MergeVertexMode', 'MergeEdgeMode', 'ContinuityMode', 'CurveOnSurfaceMode']) {
      oc.BOPAlgo_ArgumentAnalyzerExt[`Set${name}`](modes, true);
      assert.equal(modes[name](), true, `${name} must be writable`);
      oc.BOPAlgo_ArgumentAnalyzerExt[`Set${name}`](modes, false);
      assert.equal(modes[name](), false, `${name} must be resettable`);
    }
    oc.BOPAlgo_ArgumentAnalyzerExt.SetOperationType(modes, oc.BOPAlgo_Operation.BOPAlgo_CUT);
    assert.equal(modes.OperationType(), oc.BOPAlgo_Operation.BOPAlgo_CUT);
    console.log('PASS: checker constructors/overloads, valid shape, actual self-interference, diagnostic containers, analyzer modes');
  } finally {
    for (const object of owned.reverse()) object.delete();
  }
}

// The native module owns a pthread pool. End the short-lived smoke process
// explicitly once every assertion and native-object disposal has completed.
main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
