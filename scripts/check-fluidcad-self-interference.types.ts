import type {
  OpenCascadeInstance, TopoDS_Shape, Message_ProgressRange,
  BRepAlgoAPI_Check, BOPAlgo_ArgumentAnalyzer, BOPAlgo_CheckResult,
  BOPAlgo_CheckStatus, BOPAlgo_Operation,
} from '../dist/index.js';

// Compile-only consumer of the curated package's generated declarations.
export function checkTypes(oc: OpenCascadeInstance, shape: TopoDS_Shape, range: Message_ProgressRange): void {
  const checker: BRepAlgoAPI_Check = new oc.BRepAlgoAPI_Check(shape, false, true, range);
  checker.SetData(shape, false, true);
  checker.SetData(shape, shape, oc.BOPAlgo_Operation.BOPAlgo_CUT, false, true);
  checker.Perform(range);
  const valid: boolean = checker.IsValid();
  const fault: BOPAlgo_CheckResult = checker.Result().First();
  const status: BOPAlgo_CheckStatus = fault.GetCheckStatus();
  const faulty: TopoDS_Shape = fault.GetFaultyShapes1().First();
  const analyzer: BOPAlgo_ArgumentAnalyzer = new oc.BOPAlgo_ArgumentAnalyzer();
  analyzer.SetShape1(shape);
  analyzer.SetShape2(shape);
  oc.BOPAlgo_ArgumentAnalyzerExt.SetSelfInterMode(analyzer, true);
  oc.BOPAlgo_ArgumentAnalyzerExt.SetOperationType(analyzer, oc.BOPAlgo_Operation.BOPAlgo_CUT);
  const operation: BOPAlgo_Operation = analyzer.OperationType();
  const enabled: boolean = analyzer.SelfInterMode();
  analyzer.Perform(range);
  const hasFaulty: boolean = analyzer.HasFaulty();
  const analyzerFault: BOPAlgo_CheckResult = analyzer.GetCheckResult().First();
  void [valid, status, faulty, operation, enabled, hasFaulty, analyzerFault];
}
