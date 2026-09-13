import test from 'node:test';
import assert from 'node:assert/strict';
import { planCriticalPath } from './critical-path.mjs';
import { buildSubmissionPlan, RISK_GROUPS, workdays, culturalReviewConfig, controlExperimentPlan } from './submission-plan.mjs';

const report = buildSubmissionPlan();
test('明确月初日期与当前剩余13个工作日，不回填已经过去的启动', () => {
  assert.equal(report.calendar.asOf, '2026-09-13');
  assert.equal(report.calendar.originalDates[0], '2026-09-03');
  assert.equal(report.calendar.originalDates.at(-1), '2026-09-30');
  assert.equal(report.calendar.originalStartIsPast, true);
  assert.equal(report.calendar.currentDates.length, 13);
  assert.equal(report.calendar.currentProductionDays, 11);
  assert.deepEqual(report.calendar.currentDates.slice(-2), ['2026-09-29', '2026-09-30']);
});
test('工作日历支持明确不可用日，非法日期拒绝', () => {
  assert.deepEqual(workdays('2026-09-14', 2, ['2026-09-14']), ['2026-09-15', '2026-09-16']);
  assert.throws(() => workdays('2026-02-30', 2));
});
test('四文化风险组覆盖50个唯一父需求，REQ017的两件均归稀缺语种组', () => {
  const ids = RISK_GROUPS.flatMap(g => g.requests);
  assert.deepEqual(RISK_GROUPS.map(g => g.requests.length), [20, 15, 10, 5]);
  assert.equal(ids.length, 50); assert.equal(new Set(ids).size, 50);
  assert(report.fullScopeConditionalReplan.tasks.filter(t => t.parent === 'REQ-017').every(t => t.reviewGroup === 'G3'));
});
test('技术和文化QA独立守恒且不借用其他文化组工时', () => {
  const plan = report.fullScopeConditionalReplan;
  for (const d of plan.daily) {
    const q = d.review_pools;
    assert(q.technical_used_h <= q.technical_capacity_h);
    for (const g of Object.keys(q.cultural_used_h)) assert(q.cultural_used_h[g] <= q.cultural_capacity_h[g]);
    assert.equal(q.technical_used_h + Object.values(q.cultural_used_h).reduce((a, b) => a + b, 0), d.used_h.review);
  }
  assert.equal(plan.events.reduce((n, e) => n + (e.technical_h || 0), 0), 56);
  assert.equal(plan.events.reduce((n, e) => n + (e.cultural_h || 0), 0), 56);
});
test('稀缺语种主审未就绪时只等待该组，第5日备审接手', () => {
  const plan = report.fullScopeConditionalReplan;
  assert(plan.events.filter(e => e.review_group === 'G3').every(e => e.day >= 5));
  assert(plan.events.some(e => e.role === 'review' && e.review_group !== 'G3' && e.day < 5));
  assert(plan.daily.some(d => d.waiting.QUALIFIED_CULTURAL_REVIEW_WAIT > 0));
});
test('五件人工对照和比较工作全部入账，新增56h不进入51SKU计数', () => {
  const x = controlExperimentPlan();
  assert.equal(x.controls.length, 5);
  assert.equal(x.events.reduce((n, e) => n + e.hours, 0), 40);
  assert.equal(x.evidenceWork.reduce((n, e) => n + e.hours, 0), 16);
  assert.equal(x.maximumAdditionalActiveHours, 56);
  for (const role of Object.keys(x.roleDailyCapacity)) for (let day = 1; day <= 9; day++) {
    assert([...x.events, ...x.evidenceWork].filter(e => e.role === role && e.day === day).reduce((n, e) => n + e.hours, 0) <= x.roleDailyCapacity[role]);
  }
  assert.equal(report.fullScopeConditionalReplan.tasks.length, 51);
  assert.equal(report.costCeiling.totalReservedActiveHours, 438);
});
test('对照前后序接力与小语种审核等待不被成本模型隐藏', () => {
  for (const c of report.experiment.controls) { assert(c.productionDay > c.researchDay); assert(c.reviewDay > c.productionDay); }
  assert.equal(report.experiment.controls.find(c => c.group === 'G3').reviewDay, 5);
  assert(report.experiment.comparisonCompleteDay >= report.experiment.aiPilotRequiredByDay);
  assert(report.experiment.decisionReadyDay > report.experiment.comparisonCompleteDay);
});
test('ROI未就绪或未达标时首批可小试，后续制作不会放量', () => {
  for (const status of ['PENDING', 'FAIL']) {
    const x = planCriticalPath({ economicGate: { status, readyDay: 9 }, totalDays: 30, freezeDay: 29 });
    assert.equal(x.summary.approved_skus, 5);
    assert(x.tasks.filter(t => t.batch !== 'PILOT_5').every(t => t.stages[1].startDay === null));
    assert(x.daily.some(d => d.waiting.ECONOMIC_EVIDENCE_OR_APPROVAL_WAIT > 0));
  }
});
test('ROI通过仍需引用与成本复核，并与前批质量门共同约束', () => {
  assert.throws(() => planCriticalPath({ economicGate: { status: 'PASS', readyDay: 9 } }));
  const x = report.fullScopeConditionalReplan;
  assert(x.tasks.filter(t => t.batch !== 'PILOT_5').every(t => t.stages[1].startDay >= 9));
  assert.equal(x.summary.approved_skus, 51);
  const late = planCriticalPath({ researchHours: 12, productionHours: 36, reviewHours: 24, economicGate: { status: 'PASS', readyDay: 25, evidenceRef: 'SIM', approvalRef: 'SIM', costReviewComplete: true } });
  assert.equal(late.summary.approved_skus, 5);
});
test('当前日期的按期全量不能由原20日结果替代，延期需保留两日冻结', () => {
  assert(report.currentDeadlineAssumedPass.summary.approved_regions < 50);
  assert.equal(report.currentDeadlineEvidencePending.summary.approved_skus, 5);
  assert(report.fullScopeConditionalReplan.completionDate > '2026-09-28');
  assert.equal(report.fullScopeConditionalReplan.freezeDates.length, 2);
  assert(report.fullScopeConditionalReplan.earliestProposedReleaseDate > report.fullScopeConditionalReplan.freezeDates[1]);
});
test('文化池缺资格映射或工时为零时拒绝排程', () => {
  const missing = culturalReviewConfig(); delete missing.groupForRequest['REQ-017'];
  assert.throws(() => planCriticalPath({ culturalReview: missing }));
  const zero = culturalReviewConfig(); zero.culturalHours.G3 = 0;
  assert.throws(() => planCriticalPath({ culturalReview: zero }));
});
test('合格文化审核连续不可用超过两日则该请求转重排，其他组继续', () => {
  const pools = culturalReviewConfig(); pools.unavailable.G3 = Array.from({ length: 10 }, (_, i) => i + 1);
  const x = planCriticalPath({ researchHours: 12, productionHours: 36, reviewHours: 24, culturalReview: pools });
  const t = x.tasks.find(t => t.id === 'SIM-SKU-002');
  assert.equal(t.holdReason, 'CULTURAL_OWNER_SLA_EXCEEDED_REPLAN');
  assert.equal(t.approvedDay, null);
  assert(x.tasks.some(t => t.reviewGroup !== 'G3' && t.approvedDay !== null));
});
test('小试晚于第6日时经济比较的三日后序等待随之传播', () => {
  const gate = { status: 'PASS', readyDay: 9, processingDaysAfterPilot: 3, evidenceRef: 'SIM', approvalRef: 'SIM', costReviewComplete: true };
  const x = planCriticalPath({ researchHours: 12, productionHours: 36, reviewHours: 24, evidenceDelayDays: 5, economicGate: gate, totalDays: 40, freezeDay: 39 });
  const pilotDay = x.summary.batches[0].complete_day;
  assert(pilotDay > 6);
  assert(x.tasks.filter(t => t.batch !== 'PILOT_5').every(t => t.stages[1].startDay >= pilotDay + 3));
});
test('名义7h对8h仅改善12.5%，预算不能被自动当成15%ROI达标', () => {
  assert.equal(report.experiment.nominalMedianActiveHourReduction, 0.125);
  assert.equal(report.experiment.nominalHoursOnlyGate, 'FAIL');
  assert(report.experiment.nominalMedianActiveHourReduction < 0.15);
});
test('即使峰值资源和前置经济证据充足，三批返工链最早第16工作日才全量', () => {
  const bound = report.deadlineLowerBound;
  assert.deepEqual(bound.scenarios.map(p => p.summary.last_approval_day), [18, 16]);
  assert.deepEqual(bound.scenarios.map(p => p.completionDate), ['2026-10-07', '2026-10-05']);
  assert.deepEqual(bound.scenarios.map(p => p.proposedReleaseDate), ['2026-10-12', '2026-10-08']);
  const p = bound.scenarios[1];
  const doubled = planCriticalPath({ ...p.assumptions, researchHours: 204, productionHours: 216, reviewHours: 144, culturalReview: { ...p.assumptions.culturalReview, technicalHours: 72, culturalHours: { G1: 40, G2: 30, G3: 22, G4: 10 } } });
  assert.equal(doubled.summary.last_approval_day, 16);
  assert(p.summary.last_approval_day > report.calendar.currentDates.length);
  assert.equal(p.summary.approved_regions, 50);
});
test('峰值加配只改变既有217h的预约方式，真实经济证据待补仍阻断扩量', () => {
  const bound = report.deadlineLowerBound;
  assert.deepEqual(bound.incrementalEffectiveHoursAboveCurrentDailyPools, { research: 90, production: 72, technical: 24, cultural: { G1: 12, G2: 11, G3: 7, G4: 1 } });
  assert(bound.scenarios.every(p => p.summary.spent_active_h.total === 382));
  assert.equal(bound.currentROIStatus, 'PENDING');
  const pending = planCriticalPath({ ...bound.scenarios[1].assumptions, economicGate: { status: 'PENDING', readyDay: 1, processingDaysAfterPilot: 0 } });
  assert.equal(pending.summary.approved_skus, 5);
});
