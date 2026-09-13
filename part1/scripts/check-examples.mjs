import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCall, runGovernedTask } from '../governed-runner-v3.mjs';
const read = name => JSON.parse(readFileSync(new URL('../examples/' + name, import.meta.url), 'utf8'));
const contract = read('contract.json');
const policy = read('policy.json');
const call = read('render-call.json');
const refusal = read('refusal.json');
assert.equal(validateCall(JSON.stringify(call), contract).ok, true);
assert.equal(validateCall(JSON.stringify(refusal), contract).refusal, refusal.reason);
const result = await runGovernedTask({
  contract, policy,
  generate: async () => JSON.stringify(call),
  inspect: async () => ({ status: 'PASS', policy_ref: policy.ref, matched_ids: [] }),
  render: async () => ({ id: 'SIM-EXAMPLE-ASSET' }),
  geometry: async () => ({ status: 'PASS' })
});
assert.equal(result.state, 'REVIEW_READY');
assert.equal(result.published, false);
console.log('PASS · 调用 JSON、拒绝 JSON 和合成适配器示例；未发布资产。');
