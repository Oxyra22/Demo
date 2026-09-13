export const DEFAULT_INPUT = Object.freeze({
  request_id: 'SIM-GIFT-USEN-HW26-001',
  route_entry: 'US-English',
  locale: 'en-US',
  occasion: 'Halloween 2026',
  vertical: 'Gaming / Cosplay',
  price_band: 'mid',
  device_tier: 'mid',
  emotion_job: 'Turn a sent Gift into an escalating, creator-readable celebration.',
  policy_ref: 'POL-US-PROTOTYPE-2026.09',
  forbidden_symbol_ids: ['policy-symbol-id-017'],
});

export const AGENTS = Object.freeze([
  { id: 'A01', name: 'Market Evidence Agent', artifact: 'evidence_pack' },
  { id: 'A02', name: 'Brief Orchestrator', artifact: 'gift_contract' },
  { id: 'A03', name: 'Generation Agent', artifact: 'candidate_set' },
  { id: 'A04', name: 'Structure QA Agent', artifact: 'structure_qa' },
  { id: 'A05', name: 'Culture & IP Agent', artifact: 'culture_review' },
  { id: 'A06', name: 'Package & Learning Agent', artifact: 'final_package' },
]);

const deepClone = (value) => JSON.parse(JSON.stringify(value));

export function validateInput(input) {
  const required = ['request_id', 'route_entry', 'locale', 'occasion', 'price_band', 'device_tier', 'policy_ref'];
  const missing = required.filter((key) => !input[key]);
  return { valid: missing.length === 0, missing };
}

export function createEvidencePack(input) {
  return {
    schema_version: '1.0',
    request_id: input.request_id,
    market: { route_entry: input.route_entry, locale: input.locale },
    decision_maturity: 'E1_PUBLIC_SIGNAL',
    claims: [
      {
        claim_id: 'US-01',
        signal: 'Seasonal costume and creator participation are publicly observable.',
        evidence_level: 'E1',
        design_action: 'Explore creator-readable transformation without copying protected characters.',
      },
      {
        claim_id: 'US-02',
        signal: 'Face-effect programs provide an interaction precedent.',
        evidence_level: 'E1',
        design_action: 'Preserve a face-safe zone and make the Gift readable before the effect peak.',
      },
      {
        claim_id: 'US-03',
        signal: 'Gaming content guidance is a marketing precedent only.',
        evidence_level: 'E1',
        design_action: 'Use as a mechanism seed, never as proof of Gift demand.',
      },
    ],
    known_gaps: ['TikTok internal Gift demand', 'market entitlement', 'named regional reviewer', 'production policy approval'],
    gate: 'PROTOTYPE_ONLY',
  };
}

export function createGiftContract(input, evidencePack) {
  return {
    schema_version: '1.0',
    contract_version: '0.3',
    request_id: input.request_id,
    market: { route_entry: input.route_entry, locale: input.locale, evidence_level: evidencePack.decision_maturity },
    business_context: {
      occasion: input.occasion,
      vertical: input.vertical,
      price_band: input.price_band,
      emotion_job: input.emotion_job,
    },
    visual_grammar: {
      silhouette: 'single faceted glass lantern readable at 96 px',
      palette: ['#25F4EE', '#FE2C55', '#FFD84D', '#161823'],
      material: 'optical glass + restrained metallic frame',
      motion: 'quiet charge → orbit acceleration → one celebratory peak → afterglow',
      camera_safe_zone: { x: 0.28, y: 0.16, width: 0.44, height: 0.56 },
    },
    render_budget: {
      device_tier: input.device_tier,
      max_duration_ms: 3000,
      max_triangles: 18000,
      max_texture_mb: 4,
      max_particles: 320,
    },
    policy: {
      policy_ref: input.policy_ref,
      forbidden_symbol_ids: [...input.forbidden_symbol_ids],
      no_real_religious_symbol_inference: true,
      no_protected_character_likeness: true,
    },
    approval: {
      prototype_owner: 'Candidate',
      regional_reviewer: null,
      policy_reviewer: null,
      publish_owner: null,
    },
  };
}

export function generateCandidates(contract) {
  const shared = {
    request_id: contract.request_id,
    emotion_job: contract.business_context.emotion_job,
    policy_ref: contract.policy.policy_ref,
    device_tier: contract.render_budget.device_tier,
  };
  return [
    {
      ...shared,
      candidate_id: 'C-01',
      name: 'Midnight Prism',
      mechanism: 'TRANSFORM',
      form: 'faceted glass lantern with two offset energy rings',
      motion: 'charge → orbit → prism bloom → afterglow',
      palette: ['#25F4EE', '#FE2C55', '#FFD84D'],
      planned_motif_ids: [],
      render_scale: 1,
      face_overlap_ratio: 0.12,
      px96_readability: 0.91,
      novelty: 0.88,
    },
    {
      ...shared,
      candidate_id: 'C-02',
      name: 'Ceremonial Crest',
      mechanism: 'REVEAL',
      form: 'symmetrical crest with an unresolved supplied motif reference',
      motion: 'seal open → radial rays → hold',
      palette: ['#FFD84D', '#FE2C55'],
      planned_motif_ids: ['policy-symbol-id-017'],
      render_scale: 0.9,
      face_overlap_ratio: 0.06,
      px96_readability: 0.87,
      novelty: 0.74,
    },
    {
      ...shared,
      candidate_id: 'C-03',
      name: 'Candy Orbit',
      mechanism: 'COLLECT',
      form: 'four candy satellites collected into a central token',
      motion: 'collect → stack → bounce → disperse',
      palette: ['#25F4EE', '#FF7EDB', '#38D889'],
      planned_motif_ids: [],
      render_scale: 0.82,
      face_overlap_ratio: 0.05,
      px96_readability: 0.68,
      novelty: 0.79,
    },
  ];
}

export function applyBoundedRevision(candidate, delta) {
  const revised = deepClone(candidate);
  const allowed = new Set(['render_scale', 'face_overlap_ratio', 'px96_readability']);
  for (const key of Object.keys(delta)) {
    if (!allowed.has(key)) throw new Error(`Unscoped revision field: ${key}`);
    revised[key] = delta[key];
  }
  revised.revision = {
    attempt: 1,
    limit: 2,
    correction_delta: 'Reduce render scale only; preserve form, motion, palette and emotion job.',
    error_fingerprint: 'QA:FACE_SAFE_OVERLAP:C-01:0.12',
  };
  return revised;
}

export function runStructureQA(candidates) {
  const results = candidates.map((candidate) => {
    const failures = [];
    if (candidate.face_overlap_ratio > 0.1) failures.push('FACE_SAFE_OVERLAP');
    if (candidate.px96_readability < 0.75) failures.push('LOW_96PX_READABILITY');
    return {
      candidate_id: candidate.candidate_id,
      status: failures.length ? 'EDIT' : 'PASS',
      failures,
      metrics: {
        face_overlap_ratio: candidate.face_overlap_ratio,
        px96_readability: candidate.px96_readability,
        estimated_triangles: candidate.candidate_id === 'C-01' ? 6840 : 5200,
        estimated_texture_mb: 0,
      },
    };
  });
  const c01 = candidates.find((candidate) => candidate.candidate_id === 'C-01');
  const revisedC01 = applyBoundedRevision(c01, { render_scale: 0.86, face_overlap_ratio: 0.08 });
  return {
    schema_version: '1.0',
    results,
    bounded_revision: revisedC01,
    retry_count: 1,
  };
}

export function runCultureReview(candidates, contract) {
  return {
    schema_version: '1.0',
    policy_ref: contract.policy.policy_ref,
    decisions: candidates.map((candidate) => {
      const matched = candidate.planned_motif_ids.filter((id) => contract.policy.forbidden_symbol_ids.includes(id));
      return {
        candidate_id: candidate.candidate_id,
        decision: matched.length ? 'REJECT' : 'PASS',
        render_call: matched.length ? null : 'ELIGIBLE_AFTER_STRUCTURE_QA',
        matched_symbol_ids: matched,
        reason_code: matched.length ? 'FORBIDDEN_SYMBOL_INTENT' : null,
      };
    }),
    reviewer_state: 'PROTOTYPE_RULESET_ONLY',
  };
}

export function evaluateCircuitBreaker(fingerprints) {
  const recent = fingerprints.slice(-2);
  const repeated = recent.length === 2 && recent[0] && recent[0] === recent[1];
  return {
    state: repeated ? 'OPEN' : 'CLOSED',
    reason: repeated ? 'REPEATED_ERROR_FINGERPRINT' : null,
    action: repeated ? 'ISOLATE_TASK_CANCEL_QUEUE_FREEZE_TRACE' : 'CONTINUE',
  };
}

export function packageFinal(input, contract, evidencePack, candidates, structureQa, cultureReview) {
  const selected = structureQa.bounded_revision;
  const cultureDecision = cultureReview.decisions.find((decision) => decision.candidate_id === selected.candidate_id);
  if (cultureDecision.decision !== 'PASS') throw new Error('Selected candidate is not culture-policy eligible.');
  return {
    schema_version: '1.0',
    package_id: 'PKG-USEN-HW26-MIDNIGHT-PRISM-001',
    request_id: input.request_id,
    selected_candidate: selected,
    renderer: {
      tool: 'procedural_three_scene',
      geometry: ['octahedron_core', 'torus_orbit_a', 'torus_orbit_b', 'cylinder_base', 'point_sparks'],
      colors: contract.visual_grammar.palette,
      interactive: ['pointer_drag', 'auto_rotate', 'burst_preview'],
    },
    lineage: {
      evidence_claim_ids: evidencePack.claims.map((claim) => claim.claim_id),
      contract_version: contract.contract_version,
      candidate_id: selected.candidate_id,
      qa_revision_fingerprint: selected.revision.error_fingerprint,
      rejected_candidate_ids: cultureReview.decisions.filter((decision) => decision.decision === 'REJECT').map((decision) => decision.candidate_id),
    },
    status: {
      prototype_gate: 'PASS',
      regional_review: 'NOT_REVIEWED',
      policy_review: 'PROTOTYPE_RULESET_ONLY',
      production_release: 'BLOCKED',
      published: false,
    },
  };
}

export function runPipeline(input = DEFAULT_INPUT) {
  const startedAt = performance?.now?.() ?? Date.now();
  const validation = validateInput(input);
  if (!validation.valid) {
    return {
      ok: false,
      error: { code: 'MISSING_REQUIRED_INPUT', fields: validation.missing },
      circuit_breaker: evaluateCircuitBreaker([]),
    };
  }

  const evidencePack = createEvidencePack(input);
  const giftContract = createGiftContract(input, evidencePack);
  const candidates = generateCandidates(giftContract);
  const structureQa = runStructureQA(candidates);
  const cultureReview = runCultureReview(candidates, giftContract);
  const finalPackage = packageFinal(input, giftContract, evidencePack, candidates, structureQa, cultureReview);
  const endedAt = performance?.now?.() ?? Date.now();

  const artifacts = {
    evidence_pack: evidencePack,
    gift_contract: giftContract,
    candidate_set: { schema_version: '1.0', candidates },
    structure_qa: structureQa,
    culture_review: cultureReview,
    final_package: finalPackage,
  };
  const events = AGENTS.map((agent, index) => ({
    seq: index + 1,
    agent_id: agent.id,
    agent_name: agent.name,
    artifact: agent.artifact,
    state: 'DONE',
  }));

  return {
    ok: true,
    run_id: input.request_id,
    mode: 'OFFLINE_DETERMINISTIC_AGENT_PROTOTYPE',
    actual_runtime_ms: Math.max(0, Math.round((endedAt - startedAt) * 100) / 100),
    artifacts,
    events,
    summary: {
      candidates: candidates.length,
      structure_edits: 1,
      policy_rejects: 1,
      bounded_retries: structureQa.retry_count,
      selected_candidate_id: finalPackage.selected_candidate.candidate_id,
      prototype_gate: finalPackage.status.prototype_gate,
      production_release: finalPackage.status.production_release,
      published: finalPackage.status.published,
    },
  };
}

export function runDeterministicAudit() {
  const result = runPipeline(DEFAULT_INPUT);
  const artifacts = result.artifacts;
  const originalC01 = artifacts.candidate_set.candidates.find((candidate) => candidate.candidate_id === 'C-01');
  const revisedC01 = artifacts.structure_qa.bounded_revision;
  const blockedC02 = artifacts.culture_review.decisions.find((decision) => decision.candidate_id === 'C-02');
  const tests = [
    ['Required input accepted', result.ok === true],
    ['Three mechanism-diverse routes produced', new Set(artifacts.candidate_set.candidates.map((item) => item.mechanism)).size === 3],
    ['Forbidden motif blocked before render', blockedC02.decision === 'REJECT' && blockedC02.render_call === null],
    ['Bounded revision changed only safe-zone scale fields', revisedC01.emotion_job === originalC01.emotion_job && revisedC01.form === originalC01.form && revisedC01.render_scale === 0.86],
    ['Retry stayed within limit', artifacts.structure_qa.retry_count <= 2],
    ['Repeated fingerprint opens circuit breaker', evaluateCircuitBreaker(['X', 'X']).state === 'OPEN'],
    ['Missing entitlement data stays prototype-only', artifacts.evidence_pack.gate === 'PROTOTYPE_ONLY'],
    ['No human approval means no publish', artifacts.final_package.status.published === false && artifacts.final_package.status.production_release === 'BLOCKED'],
  ].map(([name, pass], index) => ({ id: `T${String(index + 1).padStart(2, '0')}`, name, pass }));
  return {
    run_id: result.run_id,
    suite: 'gift-studio-deterministic-audit-v1',
    total: tests.length,
    passed: tests.filter((test) => test.pass).length,
    failed: tests.filter((test) => !test.pass).length,
    tests,
  };
}
