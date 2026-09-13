import { runScenario } from '../governed-scenarios-v3.mjs';
const args = process.argv.slice(2);
const full = args.includes('--full');
const requested = args.filter(arg => arg !== '--full');
const names = requested.length ? requested : ['normal', 'religion', 'geometry'];
if (names.some(name => !['normal', 'religion', 'geometry'].includes(name))) {
  console.error('可用场景：normal、religion、geometry；加 --full 查看完整轨迹。');
  process.exitCode = 1;
} else {
  const results = [];
  for (const name of names) {
    const r = await runScenario(name);
    results.push(full ? r : {
      scenario: r.scenario, evidence: r.evidence, state: r.state, reason: r.reason,
      attempts: r.attempts, renders: r.renders, spent_cost_units: r.spent_cost_units,
      published: r.published, production_release: r.production_release
    });
  }
  console.log(JSON.stringify(results, null, 2));
}
