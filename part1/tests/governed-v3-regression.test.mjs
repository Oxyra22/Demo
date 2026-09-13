import test from 'node:test';
import assert from 'node:assert/strict';
import { runGovernedTask, validateCall, LIMITS } from '../governed-runner-v3.mjs';
const contract = { request_id: 'SIM-50-017', route: 'TEST-LOCALE', policy_ref: 'SYNTHETIC-P1', workflow_ids: ['approved-v1'], approved_asset_ids: ['neutral-1'], max_canvas: { w: 1080, h: 1920 }, max_duration_ms: 3000 };
const policy = { ref: contract.policy_ref, route: contract.route, expires_at: Date.now() + 86400000, forbidden_ids: ['SYNTHETIC-FORBIDDEN-01'], rules: [{id:'SYNTHETIC-FORBIDDEN-01',description:'Synthetic forbidden ornament',severity:'LOW'}], approved_alternatives: [{id:'SAFE-ARC-01',description:'Approved abstract replacement in this synthetic route'}] };
const call = (attempt = 1, overrides = {}) => JSON.stringify({ schema_version: '2.0', request_id: contract.request_id, tool: 'render_gift_asset', arguments: { workflow_id: 'approved-v1', prompt: `Approved neutral gift revision ${attempt}`, seed: attempt, asset_ids: ['neutral-1'], motif_ids: [], canvas: { w: 720, h: 1280 }, max_duration_ms: 2500, ...overrides } });
const report = (status = 'PASS') => ({ status, severity:'LOW', policy_ref: policy.ref, matched_ids: status === 'BLOCK' ? ['SYNTHETIC-FORBIDDEN-01'] : [], evidence_regions: [{part_id:'ornament',normalized_box:[0.4,0.2,0.2,0.2]}] });
const fixture = (overrides = {}) => ({ contract, policy, generate: async ({ attempt }) => call(attempt), inspect: async () => report(), render: async p => ({ id: `SIM-${p.arguments.seed}` }), geometry: async () => ({ status: 'PASS' }), ...overrides });

test('valid call passes prototype only, never publishes', async () => { const r = await runGovernedTask(fixture()); assert.equal(r.state, 'REVIEW_READY'); assert.equal(r.published, false); assert.equal(r.renders, 1); });
test('prose, extra fields and fictitious tool/assets cannot execute', () => { assert.equal(validateCall('```json{}', contract).ok, false); const p = JSON.parse(call()); p.extra = true; assert.equal(validateCall(JSON.stringify(p), contract).ok, false); assert.equal(validateCall(call(1, { asset_ids: ['invented'] }), contract).code, 'HALLUCINATED_TOOL_OR_ASSET'); assert.equal(validateCall(call(1, { workflow_id: 'shell.exec' }), contract).ok, false); });
test('oversized canvas rejected', () => assert.equal(validateCall(call(1, { canvas: { w: 10000, h: 1280 } }), contract).code, 'RENDER_BUDGET_EXCEEDED'));
test('wrong market policy produces no render', async () => { const r = await runGovernedTask(fixture({ policy: { ...policy, route: 'OTHER' } })); assert.equal(r.state, 'HUMAN_REVIEW'); assert.equal(r.renders, 0); });
test('expired policy produces no render', async () => { const r = await runGovernedTask(fixture({ policy: { ...policy, expires_at: 1 } })); assert.equal(r.attempts, 0); });
test('explicit forbidden ID blocks despite detector PASS, then bounded repair', async () => { const r = await runGovernedTask(fixture({ generate: async ({ attempt, correction }) => { if (attempt === 2) assert.match(correction, /neutral/); return call(attempt, { motif_ids: attempt === 1 ? policy.forbidden_ids : [] }); } })); assert.equal(r.state, 'REVIEW_READY'); assert.equal(r.attempts, 2); assert.equal(r.renders, 1); });
test('omitting motif ID cannot bypass trusted preflight', async () => { const r = await runGovernedTask(fixture({ inspect: async () => report('BLOCK') })); assert.equal(r.reason, 'REPEATED_POLICY_BLOCK'); assert.equal(r.renders, 0); });
test('high severity rejection never renders', async () => { const r = await runGovernedTask(fixture({ inspect: async () => ({ ...report('BLOCK'), severity: 'HIGH' }) })); assert.equal(r.state, 'REJECTED'); assert.equal(r.renders, 0); });
test('unknown detector report never renders', async () => { const r = await runGovernedTask(fixture({ inspect: async () => report('UNKNOWN') })); assert.equal(r.state, 'HUMAN_REVIEW'); assert.equal(r.renders, 0); });
test('actual output policy failure remains quarantined and cannot publish', async () => { const r = await runGovernedTask(fixture({ inspect: async ({ stage }) => report(stage === 'POST' ? 'BLOCK' : 'PASS') })); assert.equal(r.reason, 'REPEATED_POST_POLICY_BLOCK'); assert.equal(r.quarantined.length, 2); assert.equal(r.artifact, null); });
test('small-language repeated geometry error trips regardless of changed seed/text', async () => { const r = await runGovernedTask(fixture({ geometry: async () => ({ status: 'FAIL', code: 'SELF_INTERSECTION', part_id: 'rim', localized_message: 'fixture translated error' }) })); assert.equal(r.reason, 'REPEATED_GEOMETRY_FINGERPRINT'); assert.equal(r.attempts, 2); });
test('different failures still hit global attempt limit', async () => { let n = 0; const r = await runGovernedTask(fixture({ geometry: async () => ({ status: 'FAIL', code: `ERROR-${++n}`, part_id: 'rim' }) })); assert.equal(r.reason, 'ATTEMPT_LIMIT'); assert.equal(r.attempts, 3); });
test('unchanged retry call is refused before second render', async () => { const r = await runGovernedTask(fixture({ generate: async () => call(), geometry: async () => ({ status: 'FAIL', code: 'BAD', part_id: 'rim' }) })); assert.equal(r.reason, 'UNCHANGED_RETRY_PLAN'); assert.equal(r.renders, 1); });
test('cost reservation stops calls before exceeding allowance', async () => { const r = await runGovernedTask(fixture({ limits: { ...LIMITS, maxCostUnits: 4 }, geometry: async () => ({ status: 'FAIL', code: 'BAD' }) })); assert.equal(r.reason, 'COST_RESERVATION_DENIED'); assert.equal(r.spent_cost_units, 4); assert.equal(r.attempts, 1); });
test('hung generator is bounded and receives abort signal', async () => { let signal; const r = await runGovernedTask(fixture({ limits: { ...LIMITS, maxElapsedMs: 10 }, generate: (_, options) => { signal = options.signal; return new Promise(() => {}); } })); assert.equal(r.reason, 'GENERATOR_TIMEOUT_OR_UNAVAILABLE'); assert.equal(signal.aborted, true); });
test('isolated failure does not stop another market task', async () => { const [a, b] = await Promise.all([runGovernedTask(fixture({ inspect: async () => report('UNKNOWN') })), runGovernedTask(fixture())]); assert.equal(a.state, 'HUMAN_REVIEW'); assert.equal(b.state, 'REVIEW_READY'); });
test('malformed signed contract fails closed before generation', async () => { const r = await runGovernedTask(fixture({ contract: {} })); assert.equal(r.reason, 'INVALID_CONTRACT'); assert.equal(r.attempts, 0); });
test('empty rendering result cannot be passed to QA as success', async () => { const r = await runGovernedTask(fixture({ render: async () => null })); assert.equal(r.reason, 'INVALID_RENDER_OUTPUT'); assert.equal(r.artifact, null); });

// Adversarial adapters operate on copies. No test connects a model or a production service.
test('generator cannot grant itself an asset by mutating its contract copy', async () => {
  const original = structuredClone(contract);
  const r = await runGovernedTask(fixture({ contract: original, generate: async ({contract: copy, attempt}) => {
    copy.approved_asset_ids.push('invented');
    copy.max_canvas.w = 50000;
    return call(attempt, {asset_ids:['invented']});
  }}));
  assert.equal(r.reason, 'REPEATED_SCHEMA_OR_HALLUCINATION');
  assert.equal(r.renders, 0);
  assert.deepEqual(original, contract);
});

test('caller changes to original contract and policy cannot replace task authority', async () => {
  const originalContract = structuredClone(contract), originalPolicy = structuredClone(policy);
  const r = await runGovernedTask(fixture({contract:originalContract, policy:originalPolicy, generate:async({attempt}) => {
    originalContract.approved_asset_ids.push('invented');
    originalPolicy.forbidden_ids.length = 0;
    originalPolicy.rules.length = 0;
    return call(attempt, {asset_ids:['invented']});
  }}));
  assert.equal(r.renders, 0);
  assert.equal(r.reason, 'REPEATED_SCHEMA_OR_HALLUCINATION');
});

test('inspector cannot hide a declared HIGH motif by mutating policy and plan copies', async () => {
  const original = structuredClone(policy);
  original.rules[0].severity = 'HIGH';
  const r = await runGovernedTask(fixture({policy:original,
    generate:async({attempt}) => call(attempt, {motif_ids:['SYNTHETIC-FORBIDDEN-01']}),
    inspect:async({policy:copy, plan}) => {
      copy.forbidden_ids.length = 0;
      copy.rules[0].severity = 'LOW';
      plan.arguments.motif_ids.length = 0;
      return report();
    },
  }));
  assert.equal(r.reason, 'HIGH_SEVERITY_POLICY');
  assert.equal(r.renders, 0);
  assert.equal(original.rules[0].severity, 'HIGH');
  assert.deepEqual(original.forbidden_ids, ['SYNTHETIC-FORBIDDEN-01']);
});

test('mutating previous_call and locked_fields cannot bypass a repair lock or rewrite trace', async () => {
  const r = await runGovernedTask(fixture({
    generate:async({attempt, repair}) => {
      if (repair) {
        repair.previous_call.arguments.canvas.w = 600;
        repair.locked_fields.length = 0;
        repair.defect.code = 'HIDDEN';
        repair.approved_alternatives[0].id = 'invented';
      }
      return call(attempt, {canvas:{w:attempt===1 ? 720 : 600,h:1280}});
    },
    geometry:async() => ({status:'FAIL',code:'SELF_INTERSECTION',part_id:'rim'}),
  }));
  assert.equal(r.reason, 'REPAIR_CHANGED_LOCKED_FIELDS');
  assert.equal(r.renders, 1);
  const saved = r.trace.find(event => event.repair).repair;
  assert.equal(saved.previous_call.arguments.canvas.w, 720);
  assert(saved.locked_fields.includes('canvas'));
  assert.equal(saved.defect.code, 'SELF_INTERSECTION');
  assert.equal(saved.approved_alternatives[0].id, 'SAFE-ARC-01');
});

test('plan and output ownership survive mutations in downstream adapter payloads', async () => {
  const rendered = [];
  const r = await runGovernedTask(fixture({
    inspect:async({stage, plan, output}) => {
      if (stage === 'PRE') plan.arguments.canvas.w = 99999;
      else output.id = 'forged';
      return report();
    },
    render:async(plan) => {rendered.push(plan.arguments.canvas.w);plan.arguments.canvas.w=1;return{id:'actual'};},
    geometry:async(output) => {assert.equal(output.id,'actual');output.id='another';return{status:'PASS'};},
  }));
  assert.deepEqual(rendered,[720]);
  assert.equal(r.state,'REVIEW_READY');
  assert.equal(r.artifact,'actual');
  assert.deepEqual(r.quarantined,['actual']);
});

for (const limit of [{maxAttempts:3,maxCostUnits:12}, {maxAttempts:3,maxCostUnits:4}]) {
  test(`caller cannot expand a running ${limit.maxAttempts}-attempt/${limit.maxCostUnits}-unit budget`, async () => {
    const mutableLimits = {...LIMITS,...limit};
    let n = 0;
    const r = await runGovernedTask(fixture({limits:mutableLimits,
      generate:async({attempt}) => {mutableLimits.maxAttempts=5;mutableLimits.maxCostUnits=20;mutableLimits.callCostUnits=.01;mutableLimits.maxElapsedMs=999999;return call(attempt);},
      geometry:async() => ({status:'FAIL',code:`DIFFERENT_${++n}`,part_id:'rim'}),
    }));
    assert.equal(r.attempts,limit.maxCostUnits/4);
    assert.equal(r.spent_cost_units,limit.maxCostUnits);
    assert.equal(r.reason,limit.maxCostUnits===4?'COST_RESERVATION_DENIED':'ATTEMPT_LIMIT');
  });
}

for (const boundary of ['policy','wall']) {
  for (const stage of ['GENERATE','PRE','RENDER','POST','GEOMETRY']) {
    test(`${boundary} expiry during ${stage} blocks all subsequent adapter dispatch`, async () => {
      let clock = 1000;
      const calls = [];
      const entered = name => {calls.push(name);if(name===stage)clock=1100;};
      const r = await runGovernedTask(fixture({
        now:()=>clock,
        policy:{...policy,expires_at:boundary==='policy'?1100:999999},
        limits:{...LIMITS,maxElapsedMs:boundary==='wall'?100:30000},
        generate:async({attempt})=>{entered('GENERATE');return call(attempt);},
        inspect:async({stage})=>{entered(stage);return report();},
        render:async()=>{entered('RENDER');return{id:'isolated'};},
        geometry:async()=>{entered('GEOMETRY');return{status:'PASS'};},
      }));
      const sequence=['GENERATE','PRE','RENDER','POST','GEOMETRY'];
      assert.deepEqual(calls,sequence.slice(0,sequence.indexOf(stage)+1));
      assert.equal(r.reason,boundary==='policy'?'POLICY_EXPIRED':'WALL_TIME_BUDGET');
      assert.equal(r.state,boundary==='policy'?'HUMAN_REVIEW':'OPEN');
      assert.equal(r.attempts,1);
      assert.equal(r.renders,sequence.indexOf(stage)>=2?1:0);
      assert.deepEqual(r.quarantined,sequence.indexOf(stage)>=2?['isolated']:[]);
      assert.equal(r.artifact,null);
      assert.equal(r.published,false);
    });
  }
}

test('policy expiry aborts a hanging generator without starting inspection or render', async () => {
  let signal;
  const r = await runGovernedTask(fixture({now:Date.now,policy:{...policy,expires_at:Date.now()+60},
    generate:(_,options)=>{signal=options.signal;return new Promise(()=>{});},
    inspect:()=>{assert.fail('expired generation must not dispatch inspection');},
    render:()=>{assert.fail('expired generation must not dispatch rendering');},
  }));
  assert.equal(r.reason,'POLICY_EXPIRED');
  assert.equal(r.state,'HUMAN_REVIEW');
  assert.equal(signal.aborted,true);
  assert.equal(r.renders,0);
});

for (const boundary of ['policy','wall']) {
  test(`caller cannot extend the original ${boundary} deadline while generation is running`, async () => {
    let clock=1000;
    const mutablePolicy={...policy,expires_at:boundary==='policy'?1100:999999};
    const mutableLimits={...LIMITS,maxElapsedMs:boundary==='wall'?100:30000};
    const r=await runGovernedTask(fixture({now:()=>clock,policy:mutablePolicy,limits:mutableLimits,
      generate:async({attempt})=>{mutablePolicy.expires_at=999999;mutableLimits.maxElapsedMs=999999;clock=1100;return call(attempt);},
      inspect:()=>assert.fail('original expiry must stop dispatch'),
    }));
    assert.equal(r.reason,boundary==='policy'?'POLICY_EXPIRED':'WALL_TIME_BUDGET');
    assert.equal(r.renders,0);
    assert.equal(r.attempts,1);
  });
}

test('inspector cannot invent an approved alternative in its policy copy', async () => {
  const original={...policy,approved_alternatives:[]};
  const r=await runGovernedTask(fixture({policy:original,inspect:async({policy:copy})=>{
    copy.approved_alternatives.push({id:'invented',description:'Fabricated approval'});
    return report('BLOCK');
  }}));
  assert.equal(r.reason,'INSUFFICIENT_PRE_REPAIR_EVIDENCE');
  assert.equal(r.attempts,1);
  assert.equal(r.renders,0);
  assert.deepEqual(original.approved_alternatives,[]);
});

for (const stage of ['PRE','POST']) {
  test(`unknown rule ID in ${stage} goes to human review despite valid LOW repair information`, async () => {
    const r=await runGovernedTask(fixture({inspect:async({stage:current})=>current===stage?{...report('BLOCK'),matched_ids:['UNKNOWN_RULE']}:report()}));
    assert.equal(r.reason,`UNKNOWN_${stage}_POLICY`);
    assert.equal(r.state,'HUMAN_REVIEW');
    assert.equal(r.attempts,1);
    assert.equal(r.renders,stage==='PRE'?0:1);
  });
  for (const [label, regions, alternatives] of [
    ['missing location',undefined,policy.approved_alternatives],
    ['empty location',[],policy.approved_alternatives],
    ['missing alternative',report().evidence_regions,[]],
    ['both missing',undefined,[]],
    ['empty part ID',[{part_id:' ',normalized_box:[.4,.2,.2,.2]}],policy.approved_alternatives],
    ['out of bounds',[{part_id:'ornament',normalized_box:[.9,.2,.2,.2]}],policy.approved_alternatives],
    ['zero area',[{part_id:'ornament',normalized_box:[.4,.2,0,.2]}],policy.approved_alternatives],
    ['nonfinite location',[{part_id:'ornament',normalized_box:[NaN,.2,.2,.2]}],policy.approved_alternatives],
  ]) {
    test(`LOW ${stage} with ${label} cannot authorize another attempt`, async () => {
      const r=await runGovernedTask(fixture({policy:{...policy,approved_alternatives:alternatives},inspect:async({stage:current})=>current===stage?{...report('BLOCK'),evidence_regions:regions}:report()}));
      assert.equal(r.reason,`INSUFFICIENT_${stage}_REPAIR_EVIDENCE`);
      assert.equal(r.state,'HUMAN_REVIEW');
      assert.equal(r.attempts,1);
      assert.equal(r.renders,stage==='PRE'?0:1);
      assert.equal(r.artifact,null);
    });
  }
  test(`HIGH ${stage} remains rejected even without LOW repair prerequisites`, async () => {
    const r=await runGovernedTask(fixture({policy:{...policy,approved_alternatives:[]},inspect:async({stage:current})=>current===stage?{...report('BLOCK'),severity:'HIGH',evidence_regions:undefined}:report()}));
    assert.equal(r.state,'REJECTED');
    assert.equal(r.attempts,1);
    assert.equal(r.renders,stage==='PRE'?0:1);
  });
}

test('a forbidden ID cannot also serve as an approved replacement', async () => {
  const r=await runGovernedTask(fixture({policy:{...policy,approved_alternatives:[{id:'SYNTHETIC-FORBIDDEN-01',description:'Contradictory approval'}]}}));
  assert.equal(r.reason,'INVALID_POLICY_ALTERNATIVES');
  assert.equal(r.attempts,0);
  assert.equal(r.renders,0);
});
