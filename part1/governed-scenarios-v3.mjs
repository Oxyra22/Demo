import { runGovernedTask } from './governed-runner-v3.mjs';
export const EVIDENCE_LEVELS = Object.freeze({ E0: '假设', E1: '公开来源', E2: '当地审核', E3: '内部行为数据', E4: '受控实验' });
export const EVIDENCE_PERMISSIONS = Object.freeze({ E0: 'RESEARCH', E1: 'LOCAL_PROTOTYPE', E2: 'CONCEPT_SHORTLIST', E3: 'SHADOW_ASSIST', E4: 'BUDGET_EXPERIMENT' });
export async function runScenario(name) {
  const contract = { request_id: `SIM-${name}`, route: 'SIM-CULTURE-017', policy_ref: 'SYNTHETIC-P1', workflow_ids: ['approved-v1'], approved_asset_ids: ['neutral-1'], max_canvas: { w: 1080, h: 1920 }, max_duration_ms: 3000, visual_brief: 'Preserve rounded silhouette, pearl finish, centered composition and 2500ms timing.' };
  const policy = { ref: contract.policy_ref, route: contract.route, expires_at: Date.now() + 86400000, forbidden_ids: ['SYNTHETIC-FORBIDDEN-01'], rules: [{ id: 'SYNTHETIC-FORBIDDEN-01', description: 'Synthetic test ornament restricted in SIM-CULTURE-017', severity: 'LOW' }], approved_alternatives: [{ id: 'SAFE-ARC-01', description: 'Approved abstract non-sacred arc in the same location' }] };
  const calls = [];
  const result = await runGovernedTask({ contract, policy,
    generate: async ({ attempt, repair }) => {
      const repairPrompt = repair?.defect.stage === 'GEOMETRY' ? `Repair self-intersection in ${repair.defect.part_id} topology only; ${contract.visual_brief}` : repair ? `Replace motif ${repair.defect.matched_ids?.join(',')} only with SAFE-ARC-01; ${contract.visual_brief}` : contract.visual_brief;
      const plan = { schema_version: '2.0', request_id: contract.request_id, tool: 'render_gift_asset', arguments: { workflow_id: 'approved-v1', prompt: repairPrompt, seed: attempt, asset_ids: ['neutral-1'], motif_ids: name === 'religion' && attempt === 1 ? policy.forbidden_ids : [], canvas: { w: 720, h: 1280 }, max_duration_ms: 2500 } };
      calls.push({ attempt, repair, plan }); return JSON.stringify(plan);
    },
    inspect: async ({ stage, plan }) => ({ status: plan?.arguments.motif_ids.length ? 'BLOCK' : 'PASS', policy_ref: policy.ref, matched_ids: plan?.arguments.motif_ids || [], severity: 'LOW', evidence_regions: stage === 'PRE' ? [{ part_id: 'ornament', normalized_box: [0.4, 0.2, 0.2, 0.2] }] : [] }),
    render: async plan => ({ id: `SIM-ASSET-${plan.arguments.seed}` }),
    geometry: async () => name === 'geometry' ? { status: 'FAIL', code: 'SELF_INTERSECTION', part_id: 'rim', evidence: 'Synthetic intersecting rim fixture' } : { status: 'PASS' },
  });
  return { scenario: name, evidence: '合成适配器场景，未调用真实模型或画面检测器', calls, ...result };
}
