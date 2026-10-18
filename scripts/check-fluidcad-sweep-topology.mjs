// Run against the curated package after build-fluidcad.sh.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import init from '../dist/index.js';

async function main() {
  const dist = new URL('../dist/', import.meta.url);
  const oc = await init({locateFile: name => fileURLToPath(new URL(name, dist))});
  const owned = [];
  const own = object => { owned.push(object); return object; };
  const array = (Type, values) => {
    const result = own(new Type(1, values.length));
    values.forEach((value, i) => result.SetValue(i + 1, value));
    return result;
  };
  try {
    for (const name of ['GeomConvert_BSplineSurfaceToBezierSurface',
      'GeomConvert_CompBezierSurfacesToBSplineSurface', 'Geom_BezierSurface',
      'NCollection_Array2_handle_Geom_BezierSurface', 'NCollection_HArray2_gp_Pnt',
      'BRepBuilderAPI_Copy', 'BRepTools_ReShape', 'ShapeBuild_ReShape',
      'ShapeUpgrade_ShapeDivide', 'ShapeUpgrade_ShapeDivideContinuity']) {
      assert.equal(typeof oc[name], 'function', `${name} must be linked`);
    }
    // Exact, curved quadratic graph z = u² + v², split at v=1. Native
    // decomposition/composition must preserve the original parameterization.
    const sources = [];
    const beziers = own(new oc.NCollection_Array2_handle_Geom_BezierSurface(1, 1, 1, 2));
    for (let span=0; span<2; span++) {
      const poles = own(new oc.NCollection_Array2_gp_Pnt(1, 3, 1, 3));
      const squareU = [0, 0, 1];
      const squareV = [span*span, span*span+span, (span+1)*(span+1)];
      for (let u=0; u<3; u++) for (let v=0; v<3; v++) {
        const point = own(new oc.gp_Pnt(u/2, span+v/2, squareU[u]+squareV[v]));
        poles.SetValue(u+1,v+1,point);
        const read=own(oc.FluidCAD_Array2Access.PointValue(poles,u+1,v+1));
        assert.equal(read.Distance(point),0);
      }
      const surface = own(new oc.Geom_BSplineSurface(poles,
        array(oc.NCollection_Array1_double,[0,1]), array(oc.NCollection_Array1_double,[span,span+1]),
        array(oc.NCollection_Array1_int,[3,3]), array(oc.NCollection_Array1_int,[3,3]),2,2,false,false));
      sources.push(surface);
      const split = own(new oc.GeomConvert_BSplineSurfaceToBezierSurface(surface));
      assert.equal(split.NbUPatches(),1); assert.equal(split.NbVPatches(),1);
      const uk = array(oc.NCollection_Array1_double,[0,0]);
      const vk = array(oc.NCollection_Array1_double,[0,0]);
      split.UKnots(uk); split.VKnots(vk);
      assert.deepEqual([uk.Value(1),uk.Value(2),vk.Value(1),vk.Value(2)],[0,1,span,span+1]);
      const patch=own(split.Patch(1,1));
      assert.equal(patch.IsURational(),false); assert.equal(patch.IsVRational(),false);
      beziers.SetValue(1,span+1,patch);
      // Array2<Handle<...>>::Value is not exported by this generator.
      // Composition consumes the filled array natively; its geometry below
      // verifies SetValue without depending on that auxiliary read accessor.
    }
    const join=own(new oc.GeomConvert_CompBezierSurfacesToBSplineSurface(beziers,
      array(oc.NCollection_Array1_double,[0,1]),array(oc.NCollection_Array1_double,[0,1,2]),
      oc.GeomAbs_Shape.GeomAbs_C0,oc.GeomAbs_Shape.GeomAbs_C0,1e-7));
    assert.equal(join.IsDone(),true);
    const poles=own(join.Poles()), uk=own(join.UKnots()), vk=own(join.VKnots());
    const um=own(join.UMultiplicities()),vm=own(join.VMultiplicities());
    const surface=own(new oc.Geom_BSplineSurface(own(poles.Array2()),own(uk.Array1()),own(vk.Array1()),
      own(um.Array1()),own(vm.Array1()),join.UDegree(),join.VDegree(),false,false));
    assert.equal(surface.NbVKnots(),3);
    for(const u of [0,0.17,0.63,1]) for(const v of [0,0.27,1,1.39,2]) {
      const point=own(surface.Value(u,v));
      assert.ok(Math.abs(point.X()-u)<1e-12);
      assert.ok(Math.abs(point.Y()-v)<1e-12);
      assert.ok(Math.abs(point.Z()-u*u-v*v)<1e-12);
    }
    const makeFace=own(new oc.BRepBuilderAPI_MakeFace(surface,1e-7));
    const face=own(makeFace.Face());
    const copy=own(new oc.BRepBuilderAPI_Copy(face,false,false));
    const copied=own(copy.Shape()), image=own(copy.ModifiedShape(face));
    assert.equal(copied.IsSame(face),false); assert.equal(copied.IsSame(image),true);
    const reshape=own(new oc.BRepTools_ReShape());
    reshape.Replace(face,copied);
    const replaced=own(reshape.Apply(face,oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    assert.equal(replaced.IsSame(copied),true);
    const history=own(reshape.History()), modified=own(history.Modified(face));
    assert.equal(modified.Size(),1);
    assert.equal(own(modified.First()).IsSame(copied),true);
    assert.equal(history.IsRemoved(face),false);
    assert.equal(own(new oc.BRepCheck_Analyzer(replaced,true,false)).IsValid(),true);
    // Introduce a real C0 join (the upper patch gains a linear z ramp).
    // This must subdivide; a smooth graph can legitimately be healed instead.
    const crease=own(surface.Copy());
    for(let u=1;u<=crease.NbUPoles();u++) for(let v=4;v<=5;v++) {
      const p=own(crease.Pole(u,v));
      crease.SetPole(u,v,own(new oc.gp_Pnt(p.X(),p.Y(),p.Z()+0.1*(v-3))));
    }
    const creaseMaker=own(new oc.BRepBuilderAPI_MakeFace(crease,1e-7));
    const creaseFace=own(creaseMaker.Face());
    const divider=own(new oc.ShapeUpgrade_ShapeDivideContinuity(creaseFace));
    divider.SetBoundaryCriterion(oc.GeomAbs_Shape.GeomAbs_C0);
    divider.SetPCurveCriterion(oc.GeomAbs_Shape.GeomAbs_C0);
    divider.SetSurfaceCriterion(oc.GeomAbs_Shape.GeomAbs_C1);
    divider.SetSurfaceSegmentMode(false);
    assert.equal(divider.Perform(true),true);
    const divided=own(divider.Result()),context=own(divider.GetContext());
    const ex=own(new oc.TopExp_Explorer(divided,oc.TopAbs_ShapeEnum.TopAbs_FACE,oc.TopAbs_ShapeEnum.TopAbs_SHAPE));
    let count=0; for(;ex.More();ex.Next())count++;
    assert.equal(count,2);
    assert.equal(own(context.Apply(creaseFace,oc.TopAbs_ShapeEnum.TopAbs_SHAPE)).IsSame(divided),true);
    assert.equal(own(new oc.BRepCheck_Analyzer(divided,true,false)).IsValid(),true);
    console.log('PASS: native surface decomposition/composition, parameterization, containers, copy/replacement history, continuity subdivision/context');
  } finally { for(const object of owned.reverse()) object.delete(); }
}
main().then(()=>process.exit(0),error=>{console.error(error);process.exit(1);});
