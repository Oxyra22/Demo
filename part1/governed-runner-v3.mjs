// Executable fault-injection prototype. No model, GPU or production policy service is connected.
// Policy detector reports are supplied by a trusted adapter, never read from model self-assessment.
export const LIMITS = Object.freeze({ maxAttempts: 3, maxCostUnits: 12, maxElapsedMs: 30000, callCostUnits: 4 });
const keysEqual = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).sort().join('|') === [...keys].sort().join('|');
const finitePositive = n => Number.isFinite(n) && n > 0;
const cloneData = value => structuredClone(value);
const freezeData = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== 'object' || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freezeData(child, seen);
  return Object.freeze(value);
};
class GovernanceBoundaryError extends Error {
  constructor(code) { super(code); this.code = code; }
}

const validRegion = region => {
  if (!region || typeof region.part_id !== 'string' || !region.part_id.trim()) return false;
  const box = region.normalized_box;
  if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) return false;
  const [x, y, w, h] = box;
  return x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= 1 && y + h <= 1;
};

export function validateCall(raw, contract) {
  let value;
  try { value = JSON.parse(raw); } catch { return { ok: false, code: 'INVALID_JSON' }; }
  if (keysEqual(value, ['schema_version', 'request_id', 'decision', 'reason']) && value.schema_version === '2.0' && value.request_id === contract.request_id && value.decision === 'REFUSE' && typeof value.reason === 'string' && value.reason.trim()) return { ok: true, refusal: value.reason };
  if (!keysEqual(value, ['schema_version', 'request_id', 'tool', 'arguments']) || value.schema_version !== '2.0' || value.request_id !== contract.request_id || value.tool !== 'render_gift_asset') return { ok: false, code: 'INVALID_CALL_ENVELOPE' };
  const a = value.arguments;
  if (!keysEqual(a, ['workflow_id', 'prompt', 'seed', 'asset_ids', 'motif_ids', 'canvas', 'max_duration_ms']) || typeof a.prompt !== 'string' || !a.prompt.trim() || !Number.isInteger(a.seed) || a.seed < 0 || !keysEqual(a.canvas, ['w', 'h']) || ![a.canvas.w, a.canvas.h, a.max_duration_ms].every(n => Number.isInteger(n) && n > 0)) return { ok: false, code: 'INVALID_ARGUMENTS' };
  if (![a.asset_ids, a.motif_ids].every(v => Array.isArray(v) && v.every(s => typeof s === 'string') && new Set(v).size === v.length)) return { ok: false, code: 'INVALID_IDS' };
  if (!contract.workflow_ids.includes(a.workflow_id) || a.asset_ids.some(id => !contract.approved_asset_ids.includes(id))) return { ok: false, code: 'HALLUCINATED_TOOL_OR_ASSET' };
  if (a.canvas.w > contract.max_canvas.w || a.canvas.h > contract.max_canvas.h || a.max_duration_ms > contract.max_duration_ms) return { ok: false, code: 'RENDER_BUDGET_EXCEEDED' };
  return { ok: true, value };
}

// Vendor-independent geometry fingerprints: no locale, prompt text or random seed in key.
export function geometryFingerprint(report) {
  return `GEOMETRY:${report.code}:${report.part_id || 'unknown'}`;
}

export async function runGovernedTask({ contract: suppliedContract, policy: suppliedPolicy, generate, inspect, render, geometry, now = Date.now, limits: suppliedLimits = LIMITS }) {
  const started = now();
  const trace = [];
  let spent = 0, attempts = 0, renders = 0, lastPlan = null, correction = null, previousCall = null, artifactRef = null, repair = null;
  const fingerprints = new Set();
  const quarantined = [];
  let contract, policy, limits;
  const finish = (state, reason, artifact = null) => cloneData({ mode: 'SIMULATED_ADAPTERS_NOT_MODEL_VALIDATION', state, reason, attempts, renders, spent_cost_units: spent, artifact, quarantined, published: false, production_release: 'BLOCKED_PENDING_HUMAN_APPROVAL', trace });
  const stop = reason => { trace.push({ event: 'CIRCUIT_OPEN', reason, cancel_scope: contract?.request_id, pending_jobs: 'NO_FURTHER_DISPATCH', freeze_trace: true }); return finish('OPEN', reason); };
  // Authority belongs to this invocation. Callers and adapters never receive these references.
  try {
    contract = freezeData(cloneData(suppliedContract));
    policy = freezeData(cloneData(suppliedPolicy));
    limits = freezeData(cloneData(suppliedLimits));
  } catch { return finish('HUMAN_REVIEW', 'INVALID_INPUT_SNAPSHOT'); }
  if (!contract || !contract.request_id || !contract.route || !contract.policy_ref || !Array.isArray(contract.workflow_ids) || !Array.isArray(contract.approved_asset_ids) || !contract.max_canvas || ![contract.max_canvas.w, contract.max_canvas.h, contract.max_duration_ms].every(finitePositive)) return finish('HUMAN_REVIEW', 'INVALID_CONTRACT');
  if (!policy || policy.ref !== contract.policy_ref || policy.route !== contract.route || !Number.isFinite(policy.expires_at) || policy.expires_at <= now() || !Array.isArray(policy.forbidden_ids)) return finish('HUMAN_REVIEW', 'MISSING_STALE_OR_WRONG_SCOPE_POLICY');
  if (!Array.isArray(policy.rules) || policy.forbidden_ids.some(id => typeof id !== 'string' || !policy.rules.some(r => r?.id === id && typeof r.description === 'string' && r.description.trim() && ['LOW','HIGH'].includes(r.severity))) || policy.rules.some(r => !r || !policy.forbidden_ids.includes(r.id) || !['LOW','HIGH'].includes(r.severity) || typeof r.description !== 'string' || !r.description.trim()) || new Set(policy.rules.map(r=>r.id)).size !== policy.rules.length) return finish('HUMAN_REVIEW', 'INCOMPLETE_POLICY_BODY');
  if (policy.approved_alternatives !== undefined && (!Array.isArray(policy.approved_alternatives) || policy.approved_alternatives.some(a=>!a || typeof a.id !== 'string' || !a.id.trim() || policy.forbidden_ids.includes(a.id) || typeof a.description !== 'string' || !a.description.trim()) || new Set(policy.approved_alternatives.map(a=>a.id)).size !== policy.approved_alternatives.length)) return finish('HUMAN_REVIEW', 'INVALID_POLICY_ALTERNATIVES');
  const snapshot = freezeData({ ...policy, approved_alternatives: policy.approved_alternatives || [] });
  if (!limits || !Number.isInteger(limits.maxAttempts) || limits.maxAttempts < 1 || ![limits.maxCostUnits, limits.maxElapsedMs, limits.callCostUnits].every(finitePositive)) return finish('HUMAN_REVIEW', 'INVALID_LIMITS');
  const boundaryReason = () => {
    const current = now();
    if (current - started >= limits.maxElapsedMs) return 'WALL_TIME_BUDGET';
    if (current >= snapshot.expires_at) return 'POLICY_EXPIRED';
    return null;
  };
  const boundaryResult = reason => reason === 'POLICY_EXPIRED' ? finish('HUMAN_REVIEW', reason) : stop(reason);
  const checkBoundary = () => {
    const reason = boundaryReason();
    if (reason) throw new GovernanceBoundaryError(reason);
  };
  const adapterFailure = (error, fallbackReason) => error instanceof GovernanceBoundaryError ? boundaryResult(error.code) : stop(fallbackReason);
  const invoke = async (adapter, payload, onDispatch = () => {}) => {
    checkBoundary();
    const ownedPayload = cloneData(payload);
    const controller = new AbortController();
    const current = now();
    const wallRemaining = limits.maxElapsedMs - (current - started);
    const policyRemaining = snapshot.expires_at - current;
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => {
          // Check at the actual dispatch boundary, including time spent copying input.
          checkBoundary();
          onDispatch();
          return adapter(ownedPayload, { signal: controller.signal });
        }).then(cloneData),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(policyRemaining < wallRemaining ? new GovernanceBoundaryError('POLICY_EXPIRED') : new Error('ADAPTER_DEADLINE'));
          }, Math.max(0, Math.min(wallRemaining, policyRemaining)));
        }),
      ]);
    } finally { clearTimeout(timer); }
  };
  const retry = (fingerprint, delta, defect = {}) => {
    repair = freezeData(cloneData({ previous_call: previousCall, artifact_ref: artifactRef, defect, locked_fields: ['workflow_id', 'asset_ids', 'canvas', 'max_duration_ms'], allowed_changes: ['prompt', 'motif_ids', 'seed'], policy_ref: snapshot.ref, approved_alternatives: snapshot.approved_alternatives }));
    trace.push({ event: 'BOUNDED_REPAIR', fingerprint, correction: delta, repair: cloneData(repair) });
    if (fingerprints.has(fingerprint)) return false;
    fingerprints.add(fingerprint); correction = delta; return true;
  };
  const checkReport = report => {
    if (!report || report.policy_ref !== snapshot.ref || !['PASS', 'BLOCK', 'UNKNOWN'].includes(report.status) || !Array.isArray(report.matched_ids)) return 'UNKNOWN';
    if (report.status === 'PASS' && report.matched_ids.length) return 'UNKNOWN';
    if (report.matched_ids.some(id=>typeof id !== 'string' || !snapshot.rules.some(rule=>rule.id === id))) return 'UNKNOWN';
    if (report.status === 'BLOCK' && !['LOW','HIGH'].includes(report.severity)) return 'UNKNOWN';
    return report.status;
  };
  const canRepairPolicy = defect => defect.matched_ids.length > 0 && Array.isArray(defect.evidence_regions) && defect.evidence_regions.length > 0 && defect.evidence_regions.every(validRegion) && snapshot.approved_alternatives.length > 0;
  while (attempts < limits.maxAttempts) {
    const beforeAttempt = boundaryReason();
    if (beforeAttempt) return boundaryResult(beforeAttempt);
    if (spent + limits.callCostUnits > limits.maxCostUnits) return stop('COST_RESERVATION_DENIED');
    let raw;
    try {
      raw = await invoke(generate, { contract, policy_snapshot: snapshot, correction, repair, attempt: attempts + 1 }, () => {
        attempts++; spent += limits.callCostUnits;
        trace.push({ event: 'ATTEMPT_RESERVED', attempt: attempts, reserved_units: limits.callCostUnits });
      });
    } catch (error) { return adapterFailure(error, 'GENERATOR_TIMEOUT_OR_UNAVAILABLE'); }
    const afterGeneration = boundaryReason();
    if (afterGeneration) return boundaryResult(afterGeneration);
    const parsed = validateCall(raw, contract);
    if (parsed.refusal) { trace.push({ event: 'GENERATOR_REFUSED', reason: parsed.refusal }); return finish('HUMAN_REVIEW', 'GENERATOR_REFUSAL'); }
    if (!parsed.ok) {
      if (!retry(parsed.code, 'Return the exact v2 JSON schema; use only signed contract tool, assets and budgets.')) return stop('REPEATED_SCHEMA_OR_HALLUCINATION');
      continue;
    }
    const plan = freezeData(parsed.value);
    if (repair?.previous_call && repair.locked_fields.some(key => JSON.stringify(plan.arguments[key]) !== JSON.stringify(repair.previous_call.arguments[key]))) return finish('HUMAN_REVIEW', 'REPAIR_CHANGED_LOCKED_FIELDS');
    const signature = JSON.stringify(plan.arguments);
    if (signature === lastPlan) return stop('UNCHANGED_RETRY_PLAN');
    lastPlan = signature;
    previousCall = freezeData(cloneData(plan));
    // Planned IDs AND actual prompt/form inspection; a missing motif ID cannot bypass the adapter.
    let pre;
    try { pre = await invoke(inspect, { stage: 'PRE', plan, policy: snapshot }); } catch (error) { return adapterFailure(error, 'POLICY_ADAPTER_UNAVAILABLE'); }
    const afterPre = boundaryReason();
    if (afterPre) return boundaryResult(afterPre);
    const explicitMatch = plan.arguments.motif_ids.filter(id => snapshot.forbidden_ids.includes(id));
    const preStatus = checkReport(pre);
    if (preStatus === 'UNKNOWN') return finish('HUMAN_REVIEW', 'UNKNOWN_PRE_POLICY');
    if (explicitMatch.length || preStatus === 'BLOCK') {
      trace.push({ event: 'RENDER_DENIED', attempt: attempts, policy_ref: policy.ref });
      if (pre.severity === 'HIGH' || [...explicitMatch,...pre.matched_ids].some(id=>snapshot.rules.some(r=>r.id===id && r.severity==='HIGH'))) return finish('REJECTED', 'HIGH_SEVERITY_POLICY');
      const defect = { ...pre, stage: 'PRE', matched_ids: [...new Set([...explicitMatch, ...pre.matched_ids])] };
      if (!canRepairPolicy(defect)) return finish('HUMAN_REVIEW', 'INSUFFICIENT_PRE_REPAIR_EVIDENCE');
      if (!retry('POLICY_PRE_BLOCK', 'Replace only the prohibited motif with an approved neutral form; preserve other signed brief fields.', defect)) return stop('REPEATED_POLICY_BLOCK');
      continue;
    }
    let output;
    try { output = await invoke(render, plan, () => { renders++; }); } catch (error) { return adapterFailure(error, 'RENDER_ADAPTER_UNAVAILABLE'); }
    if (!output || typeof output.id !== 'string' || !output.id) return finish('HUMAN_REVIEW', 'INVALID_RENDER_OUTPUT');
    quarantined.push(output.id);
    artifactRef = output.id;
    const afterRender = boundaryReason();
    if (afterRender) return boundaryResult(afterRender);
    let post;
    try { post = await invoke(inspect, { stage: 'POST', output, policy: snapshot }); } catch (error) { return adapterFailure(error, 'POLICY_ADAPTER_UNAVAILABLE'); }
    const afterPost = boundaryReason();
    if (afterPost) return boundaryResult(afterPost);
    const postStatus = checkReport(post);
    if (postStatus === 'UNKNOWN') return finish('HUMAN_REVIEW', 'UNKNOWN_POST_POLICY');
    if (postStatus === 'BLOCK') {
      if (post.severity === 'HIGH' || post.matched_ids.some(id=>snapshot.rules.some(r=>r.id===id && r.severity==='HIGH'))) return finish('REJECTED', 'HIGH_SEVERITY_POST_POLICY');
      const defect = { ...post, stage: 'POST' };
      if (!canRepairPolicy(defect)) return finish('HUMAN_REVIEW', 'INSUFFICIENT_POST_REPAIR_EVIDENCE');
      if (!retry('POLICY_POST_BLOCK', 'Actual output contains prohibited form. Quarantine it; rebuild only affected form using approved neutral topology.', defect)) return stop('REPEATED_POST_POLICY_BLOCK');
      continue;
    }
    let qa;
    try { qa = await invoke(geometry, output); } catch (error) { return adapterFailure(error, 'GEOMETRY_ADAPTER_UNAVAILABLE'); }
    const afterGeometry = boundaryReason();
    if (afterGeometry) return boundaryResult(afterGeometry);
    if (!qa || !['PASS', 'FAIL'].includes(qa.status)) return finish('HUMAN_REVIEW', 'UNKNOWN_GEOMETRY');
    if (qa.status === 'FAIL') {
      if (!qa.code) return finish('HUMAN_REVIEW', 'MISSING_GEOMETRY_EVIDENCE');
      if (!retry(geometryFingerprint(qa), `Repair topology for ${qa.part_id || 'unknown part'} only; preserve contract; do not translate the same broken prompt.`, { ...qa, stage: 'GEOMETRY' })) return stop('REPEATED_GEOMETRY_FINGERPRINT');
      continue;
    }
    const beforeApproval = boundaryReason();
    if (beforeApproval) return boundaryResult(beforeApproval);
    trace.push({ event: 'PROTOTYPE_QA_PASS', output_id: output.id });
    return finish('REVIEW_READY', 'HUMAN_APPROVAL_REQUIRED', output.id);
  }
  return stop('ATTEMPT_LIMIT');
}
