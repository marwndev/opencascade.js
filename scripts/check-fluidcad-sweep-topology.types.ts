import type { OpenCascadeInstance, Geom_BSplineSurface, TopoDS_Shape } from '../dist/index.js';

export function checkSweepTopologyTypes(oc: OpenCascadeInstance, surface: Geom_BSplineSurface, shape: TopoDS_Shape) {
  const split = new oc.GeomConvert_BSplineSurfaceToBezierSurface(surface);
  const uk = new oc.NCollection_Array1_double(1, split.NbUPatches() + 1);
  const vk = new oc.NCollection_Array1_double(1, split.NbVPatches() + 1);
  split.UKnots(uk); split.VKnots(vk);
  const patches = new oc.NCollection_Array2_handle_Geom_BezierSurface(1, split.NbUPatches(), 1, split.NbVPatches());
  patches.SetValue(1, 1, split.Patch(1, 1));
  split.Patches(patches);
  const join = new oc.GeomConvert_CompBezierSurfacesToBSplineSurface(patches, uk, vk,
    oc.GeomAbs_Shape.GeomAbs_C0, oc.GeomAbs_Shape.GeomAbs_C0, 1e-7);
  const joined = new oc.Geom_BSplineSurface(join.Poles().Array2(), join.UKnots().Array1(), join.VKnots().Array1(),
    join.UMultiplicities().Array1(), join.VMultiplicities().Array1(), join.UDegree(), join.VDegree(), false, false);
  const copy = new oc.BRepBuilderAPI_Copy(shape, false, false);
  const reshape = new oc.BRepTools_ReShape();
  reshape.Replace(shape, copy.ModifiedShape(shape));
  const rebuilt = reshape.Apply(shape, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  const history = reshape.History();
  return {joined, rebuilt, modified: history.Modified(shape), removed: history.IsRemoved(shape)};
}
