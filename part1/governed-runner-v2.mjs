// Executable fault-injection prototype. No model, GPU or production policy service is connected.
// Policy detector reports are supplied by a trusted adapter, never read from model self-assessment.
export const LIMITS = Object.freeze({ maxAttempts: 3, maxCostUnits: 12, maxElapsedMs: 30000, callCostUnits: 4 });
const keysEqual = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) && Object.keys(object).sort().join('|') === [...keys].sort().join('|');
const finitePositive = n => Number.isFinite(n) && n > 0;

export function validateCall(raw, contract) {
  let value;
  try { value = JSON.parse(raw); } catch { return { ok: false, code: 'INVALID_JSON' }; }
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

export async function runGovernedTask({ contract, policy, generate, inspect, render, geometry, now = Date.now, limits = LIMITS }) {
  const started = now();
  const trace = [];
  let spent = 0, attempts = 0, renders = 0, lastPlan = null, correction = null;
  const fingerprints = new Set();
  const quarantined = [];
  const invoke = async (adapter, payload) => {
    const controller = new AbortController();
    const remaining = Math.max(1, limits.maxElapsedMs - (now() - started));
    let timer;
    try {
      return await Promise.race([
        Promise.resolve().then(() => adapter(payload, { signal: controller.signal })),
        new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('ADAPTER_DEADLINE')); }, remaining); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  const finish = (state, reason, artifact = null) => ({ mode: 'SIMULATED_ADAPTERS_NOT_MODEL_VALIDATION', state, reason, attempts, renders, spent_cost_units: spent, artifact, quarantined, published: false, production_release: 'BLOCKED_PENDING_HUMAN_APPROVAL', trace });
  const stop = reason => { trace.push({ event: 'CIRCUIT_OPEN', reason, cancel_scope: contract?.request_id, pending_jobs: 'NO_FURTHER_DISPATCH', freeze_trace: true }); return finish('OPEN', reason); };
  if (!contract || !contract.request_id || !contract.route || !contract.policy_ref || !Array.isArray(contract.workflow_ids) || !Array.isArray(contract.approved_asset_ids) || !contract.max_canvas || ![contract.max_canvas.w, contract.max_canvas.h, contract.max_duration_ms].every(finitePositive)) return finish('HUMAN_REVIEW', 'INVALID_CONTRACT');
  if (!policy || policy.ref !== contract.policy_ref || policy.route !== contract.route || !Number.isFinite(policy.expires_at) || policy.expires_at <= now() || !Array.isArray(policy.forbidden_ids)) return finish('HUMAN_REVIEW', 'MISSING_STALE_OR_WRONG_SCOPE_POLICY');
  if (!Number.isInteger(limits.maxAttempts) || limits.maxAttempts < 1 || ![limits.maxCostUnits, limits.maxElapsedMs, limits.callCostUnits].every(finitePositive)) return finish('HUMAN_REVIEW', 'INVALID_LIMITS');
  const retry = (fingerprint, delta) => {
    trace.push({ event: 'BOUNDED_REPAIR', fingerprint, correction: delta });
    if (fingerprints.has(fingerprint)) return false;
    fingerprints.add(fingerprint); correction = delta; return true;
  };
  const checkReport = report => {
    if (!report || report.policy_ref !== policy.ref || !['PASS', 'BLOCK', 'UNKNOWN'].includes(report.status) || !Array.isArray(report.matched_ids)) return 'UNKNOWN';
    if (report.status === 'PASS' && report.matched_ids.length) return 'UNKNOWN';
    return report.status;
  };
  while (attempts < limits.maxAttempts) {
    if (now() - started >= limits.maxElapsedMs) return stop('WALL_TIME_BUDGET');
    if (spent + limits.callCostUnits > limits.maxCostUnits) return stop('COST_RESERVATION_DENIED');
    attempts++; spent += limits.callCostUnits;
    trace.push({ event: 'ATTEMPT_RESERVED', attempt: attempts, reserved_units: limits.callCostUnits });
    let raw;
    try { raw = await invoke(generate, { contract, correction, attempt: attempts }); } catch { return stop('GENERATOR_TIMEOUT_OR_UNAVAILABLE'); }
    if (now() - started >= limits.maxElapsedMs) return stop('WALL_TIME_BUDGET');
    const parsed = validateCall(raw, contract);
    if (!parsed.ok) {
      if (!retry(parsed.code, 'Return the exact v2 JSON schema; use only signed contract tool, assets and budgets.')) return stop('REPEATED_SCHEMA_OR_HALLUCINATION');
      continue;
    }
    const plan = parsed.value;
    const signature = JSON.stringify(plan.arguments);
    if (signature === lastPlan) return stop('UNCHANGED_RETRY_PLAN');
    lastPlan = signature;
    // Planned IDs AND actual prompt/form inspection; a missing motif ID cannot bypass the adapter.
    let pre;
    try { pre = await invoke(inspect, { stage: 'PRE', plan, policy }); } catch { return stop('POLICY_ADAPTER_UNAVAILABLE'); }
    const explicitMatch = plan.arguments.motif_ids.filter(id => policy.forbidden_ids.includes(id));
    const preStatus = checkReport(pre);
    if (preStatus === 'UNKNOWN') return finish('HUMAN_REVIEW', 'UNKNOWN_PRE_POLICY');
    if (explicitMatch.length || preStatus === 'BLOCK') {
      trace.push({ event: 'RENDER_DENIED', attempt: attempts, policy_ref: policy.ref });
      if (pre.severity === 'HIGH') return finish('REJECTED', 'HIGH_SEVERITY_POLICY');
      if (!retry('POLICY_PRE_BLOCK', 'Replace only the prohibited motif with an approved neutral form; preserve other signed brief fields.')) return stop('REPEATED_POLICY_BLOCK');
      continue;
    }
    if (now() - started >= limits.maxElapsedMs) return stop('WALL_TIME_BUDGET');
    let output;
    try { renders++; output = await invoke(render, plan); } catch { return stop('RENDER_ADAPTER_UNAVAILABLE'); }
    if (!output || typeof output.id !== 'string' || !output.id) return finish('HUMAN_REVIEW', 'INVALID_RENDER_OUTPUT');
    quarantined.push(output.id);
    if (now() - started >= limits.maxElapsedMs) return stop('WALL_TIME_BUDGET');
    let post;
    try { post = await invoke(inspect, { stage: 'POST', output, policy }); } catch { return stop('POLICY_ADAPTER_UNAVAILABLE'); }
    const postStatus = checkReport(post);
    if (postStatus === 'UNKNOWN') return finish('HUMAN_REVIEW', 'UNKNOWN_POST_POLICY');
    if (postStatus === 'BLOCK') {
      if (post.severity === 'HIGH') return finish('REJECTED', 'HIGH_SEVERITY_POST_POLICY');
      if (!retry('POLICY_POST_BLOCK', 'Actual output contains prohibited form. Quarantine it; rebuild only affected form using approved neutral topology.')) return stop('REPEATED_POST_POLICY_BLOCK');
      continue;
    }
    let qa;
    try { qa = await invoke(geometry, output); } catch { return stop('GEOMETRY_ADAPTER_UNAVAILABLE'); }
    if (!qa || !['PASS', 'FAIL'].includes(qa.status)) return finish('HUMAN_REVIEW', 'UNKNOWN_GEOMETRY');
    if (qa.status === 'FAIL') {
      if (!qa.code) return finish('HUMAN_REVIEW', 'MISSING_GEOMETRY_EVIDENCE');
      if (!retry(geometryFingerprint(qa), `Repair topology for ${qa.part_id || 'unknown part'} only; preserve contract; do not translate the same broken prompt.`)) return stop('REPEATED_GEOMETRY_FINGERPRINT');
      continue;
    }
    if (now() - started >= limits.maxElapsedMs) return stop('WALL_TIME_BUDGET');
    trace.push({ event: 'PROTOTYPE_QA_PASS', output_id: output.id });
    return finish('REVIEW_READY', 'HUMAN_APPROVAL_REQUIRED', output.id);
  }
  return stop('ATTEMPT_LIMIT');
}
