import test from 'node:test';
import assert from 'node:assert/strict';
import { planCriticalPath, createScenarioReport, ROLES } from './critical-path.mjs';
const report = createScenarioReport(), cases = report.cases;
const invariantCases = [...cases, report.fixed_deadline_plan];
const extended = options => planCriticalPath({ ...options, totalDays: 60, freezeDay: 59 });

test('51 SKU preserve 50 parent requirements and both REQ-017 variants', () => {
  const r = cases[0];
  assert.equal(r.tasks.length, 51);
  assert.equal(new Set(r.tasks.map(t => t.parent)).size, 50);
  assert.deepEqual(r.tasks.filter(t => t.parent === 'REQ-017').map(t => t.id), ['SIM-SKU-017', 'SIM-SKU-051']);
  assert.equal(r.summary.approved_skus + r.summary.deferred.length, 51);
  assert.equal(r.summary.approved_regions, new Set(r.tasks.map(t => t.parent).filter(p => r.tasks.filter(t => t.parent === p).every(t => t.approvedDay !== null))).size);
});

test('workload includes all initial work plus 10 actual rework-production and re-review stages', () => {
  assert.equal(cases[0].tasks.filter(t => t.needsRework).length, 10);
  assert.deepEqual(cases[0].summary.planned_active_h, { research: 102, production: 168, review: 112, total: 382 });
});

test('spent plus remaining hours conserve every role and total across all scenarios', () => {
  for (const r of invariantCases) for (const role of [...ROLES, 'total']) {
    assert.equal(r.summary.spent_active_h[role] + r.summary.remaining_active_h[role], r.summary.planned_active_h[role]);
    assert(r.summary.remaining_active_h[role] >= 0);
  }
});

test('raw work events reconcile to each stage and cannot spend future or completed work twice', () => {
  for (const r of invariantCases) for (const t of r.tasks) for (const s of t.stages) {
    const events = r.events.filter(e => e.task === t.id && e.stage === s.name);
    assert.equal(events.reduce((n, e) => n + e.hours, 0) + s.remaining, s.hours);
    assert(events.every(e => e.day >= s.startDay && (!s.completedDay || e.day <= s.completedDay)));
    if (s.completedDay !== null) assert.equal(s.remaining, 0);
  }
});

test('no daily role overspend or borrowing of idle days; all roles stop for freeze', () => {
  for (const r of invariantCases) for (const d of r.daily) for (const role of ROLES) {
    assert(d.used_h[role] >= 0 && d.used_h[role] <= d.capacity_h[role]);
    if (d.day >= r.assumptions.freezeDay) assert.equal(d.used_h[role], 0);
  }
  assert.equal(cases[0].daily[0].used_h.production, 0);
  assert.equal(cases[0].daily[0].used_h.review, 0);
  assert(invariantCases.every(r => r.tasks.every(t => t.approvedDay === null || t.approvedDay < 19)));
});

test('every successor starts only after its predecessor completed plus the required transfer delay', () => {
  for (const r of [...invariantCases, extended({})]) for (const t of r.tasks) for (let i = 1; i < t.stages.length; i++) {
    const s = t.stages[i], previous = t.stages[i - 1];
    if (s.startDay === null) continue;
    assert.notEqual(previous.completedDay, null);
    const delay = s.name === 'REWORK_PRODUCTION' ? r.assumptions.reworkWaitDays : r.assumptions.handoffDays;
    assert(s.startDay >= previous.completedDay + delay);
  }
});

test('missing production permission allows research but no early production', () => {
  const t = cases[0].tasks[0];
  assert(t.stages[0].completedDay < t.offlinePermissionReadyDay);
  for (const r of invariantCases) for (const t of r.tasks) {
    if (t.stages[1].startDay !== null) assert(t.stages[1].startDay >= t.offlinePermissionReadyDay);
  }
});

test('five pilot acceptances and ten follow-up acceptances are prerequisites to expanding production', () => {
  for (const r of [...invariantCases, extended({})]) for (const [next, previous] of [['ASSIST_10', 'PILOT_5'], ['SCALE_36', 'ASSIST_10']]) {
    const predecessors = r.tasks.filter(t => t.batch === previous);
    for (const t of r.tasks.filter(t => t.batch === next && t.stages[1].startDay !== null)) {
      assert(predecessors.every(p => p.approvedDay !== null));
      assert(t.stages[1].startDay >= Math.max(...predecessors.map(p => p.approvedDay)) + r.assumptions.batchApprovalDays);
    }
  }
});

test('rework consumes production capacity and re-review capacity after its two-day waiting period', () => {
  const r = extended({});
  for (const t of r.tasks.filter(t => t.needsRework)) {
    const first = t.stages.find(s => s.name === 'FIRST_REVIEW');
    const redo = t.stages.find(s => s.name === 'REWORK_PRODUCTION');
    const final = t.stages.find(s => s.name === 'FINAL_REVIEW');
    assert(redo.startDay >= first.completedDay + 2);
    assert.equal(redo.hours, 1.5);
    assert.equal(final.hours, 1);
    assert(final.startDay >= redo.completedDay + 1);
  }
});

test('moving the freeze later completes all work with exactly 382 active hours', () => {
  for (const r of cases) {
    assert.notEqual(r.extended_deadline_scenario.full_completion_day, null);
    assert.deepEqual(r.extended_deadline_scenario.spent_active_h, { research: 102, production: 168, review: 112, total: 382 });
  }
  const r = extended({});
  assert.equal(r.summary.approved_skus, 51);
  assert.equal(r.summary.approved_regions, 50);
  assert.equal(r.summary.remaining_active_h.total, 0);
});

test('an independent research bottleneck reduces deadline completion', () => {
  assert(planCriticalPath({ researchHours: 1 }).summary.approved_skus < cases[0].summary.approved_skus);
});

test('an independent production bottleneck reduces deadline completion', () => {
  assert(planCriticalPath({ productionHours: 2 }).summary.approved_skus < cases[0].summary.approved_skus);
});

test('an independent review bottleneck reduces deadline completion and extra review does not solve all dependencies', () => {
  assert(planCriticalPath({ reviewHours: 1 }).summary.approved_skus < cases[0].summary.approved_skus);
  assert(cases[1].summary.approved_skus > cases[0].summary.approved_skus);
  assert(cases[1].summary.approved_skus < 51);
});

test('three-day evidence wait propagates through the critical path', () => {
  assert.equal(cases[3].tasks[0].stages[0].startDay, cases[2].tasks[0].stages[0].startDay + 3);
  assert.equal(cases[3].extended_deadline_scenario.full_completion_day, cases[2].extended_deadline_scenario.full_completion_day + 3);
  assert(cases[3].summary.approved_skus < cases[2].summary.approved_skus);
});

test('reviewer unavailable days remove capacity and lower completed scope', () => {
  const r = planCriticalPath({ unavailable: { review: [11, 12] } });
  assert(r.daily.filter(d => [11, 12].includes(d.day)).every(d => d.capacity_h.review === 0 && d.used_h.review === 0));
  assert(r.summary.approved_skus < cases[0].summary.approved_skus);
});

test('nonpositive handoffs, negative waits and invalid resource budgets are rejected', () => {
  for (const options of [{ handoffDays: 0 }, { reworkWaitDays: 0 }, { batchApprovalDays: 0 }, { evidenceDelayDays: -1 }, { productionHours: 0 }, { freezeDay: 21 }, { unavailable: { review: [1.5] } }]) assert.throws(() => planCriticalPath(options));
});

test('fixed deadline plan completes 51 SKU and 50 regions by day 18 with all ten reworks retained', () => {
  const r = report.fixed_deadline_plan;
  assert.equal(r.summary.approved_skus, 51);
  assert.equal(r.summary.approved_regions, 50);
  assert.equal(r.summary.last_approval_day, 18);
  assert.equal(r.tasks.filter(t => t.needsRework).length, 10);
  assert.equal(r.tasks.filter(t => t.needsRework).flatMap(t => t.stages).filter(s => s.name === 'REWORK_PRODUCTION' && s.completedDay !== null).length, 10);
  assert.deepEqual(r.summary.spent_active_h, { research: 102, production: 168, review: 112, total: 382 });
  assert.deepEqual(r.summary.batches.map(b => b.complete_day), [6, 11, 18]);
  assert.deepEqual([...new Set(r.tasks.map(t => t.budgetScope))].map(b => r.tasks.filter(t => t.budgetScope === b).length), [5, 10, 10, 10, 10, 6]);
});

test('fixed deadline extra staffed hours are calculated by day, without borrowing unused baseline capacity', () => {
  const r = report.fixed_deadline_plan, baseline = { research: 6, production: 12, review: 6 };
  const actual = Object.fromEntries(ROLES.map(role => [role, r.daily.reduce((n, d) => n + Math.max(0, d.used_h[role] - baseline[role]), 0)]));
  assert.deepEqual(actual, { research: 48, production: 90, review: 70 });
  assert.deepEqual(r.resource_plan.incremental_effective_h_above_original_daily_capacity, { ...actual, total: 208 });
});

test('fixed deadline plan still exposes an unabsorbed three-day evidence delay', () => {
  assert(report.fixed_deadline_plan.three_day_evidence_delay_stress.approved_skus < 51);
  assert(report.fixed_deadline_plan.three_day_evidence_delay_stress.deferred.length > 0);
});
