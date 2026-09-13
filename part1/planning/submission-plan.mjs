import { planCriticalPath } from './critical-path.mjs';

export const CALENDAR = Object.freeze({ asOf: '2026-09-13', start: '2026-09-14', target: '2026-10-01', timeZone: 'Asia/Shanghai', releaseTime: '09:00', freezeDays: 2, excludedDates: [] });
const requestId = n => `REQ-${String(n).padStart(3, '0')}`;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => i + a);
export const RISK_GROUPS = [
  { id: 'G1', name: '资料较完整、语义稳定', requests: [1, 5, ...range(6, 24).filter(n => n !== 17)].map(requestId), primary: '文化主审-G1', backup: '文化备审-G1', cultureHoursPerDay: 3 },
  { id: 'G2', name: '一般变体或语境待澄清', requests: [4, ...range(25, 38)].map(requestId), primary: '文化主审-G2', backup: '文化备审-G2', cultureHoursPerDay: 3 },
  { id: 'G3', name: '稀缺语种或翻译冲突', requests: [2, 17, ...range(39, 46)].map(requestId), primary: '稀缺语种主审-G3', backup: '同语种备审-G3', cultureHoursPerDay: 3 },
  { id: 'G4', name: '宗教或纪念等敏感语境', requests: [3, ...range(47, 50)].map(requestId), primary: '当地文化与政策联审-G4', backup: '同文化与政策备审-G4', cultureHoursPerDay: 3 },
];

export function workdays(start, count, excludedDates = []) {
  const date = new Date(`${start}T12:00:00Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== start || !Number.isInteger(count) || count < 1) throw Error('Invalid calendar');
  const excluded = new Set(excludedDates), result = [];
  while (result.length < count) {
    const iso = date.toISOString().slice(0, 10), weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6 && !excluded.has(iso)) result.push(iso);
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return result;
}

export function culturalReviewConfig() {
  return {
    technicalHours: 12,
    maxUnavailableWaitDays: 2,
    culturalHours: Object.fromEntries(RISK_GROUPS.map(g => [g.id, g.cultureHoursPerDay])),
    groupForRequest: Object.fromEntries(RISK_GROUPS.flatMap(g => g.requests.map(id => [id, g.id]))),
    // 主审未能在首审就绪日3到岗；第4日升级，第5日由已核资质的备审接手。
    unavailable: { G3: [1, 2, 3, 4] },
  };
}

export function controlExperimentPlan() {
  const controls = [
    { id: 'CONTROL-01', group: 'G1', researchDay: 1, productionDay: 2, reviewDay: 3 },
    { id: 'CONTROL-02', group: 'G3', researchDay: 1, productionDay: 2, reviewDay: 5 },
    { id: 'CONTROL-03', group: 'G4', researchDay: 2, productionDay: 3, reviewDay: 4 },
    { id: 'CONTROL-04', group: 'G2', researchDay: 2, productionDay: 3, reviewDay: 4 },
    { id: 'CONTROL-05', group: 'G1', researchDay: 3, productionDay: 4, reviewDay: 5 },
  ];
  const events = controls.flatMap(c => [
    { task: c.id, day: c.researchDay, role: 'control_research', hours: 2 },
    { task: c.id, day: c.productionDay, role: 'control_production', hours: 4 },
    { task: c.id, day: c.reviewDay, role: 'control_qa', hours: 2, group: c.group },
  ]);
  const evidenceWork = [
    { task: 'COMPARABILITY_AUDIT', day: 1, role: 'comparison_pm', hours: 5 },
    { task: 'BLIND_PAIR_REVIEW', day: 7, role: 'comparison_qa', hours: 5 },
    { task: 'COST_RECONCILIATION', day: 8, role: 'comparison_pm', hours: 4 },
    { task: 'ADJUDICATION_RESERVE', day: 8, role: 'comparison_qa', hours: 2, reserve: true },
  ];
  return {
    status: 'PLANNED_NOT_EXECUTED', baselineMode: 'NEW_MANUAL_CONTROLS', controls, events, evidenceWork,
    roleDailyCapacity: { control_research: 4, control_production: 8, control_qa: 4, comparison_pm: 5, comparison_qa: 5 },
    humanControlsHours: 40, comparisonPlannedHours: 14, adjudicationReserveHours: 2, maximumAdditionalActiveHours: 56,
    nominalMedianActiveHourReduction: (8 - 7) / 8, nominalHoursOnlyGate: 'FAIL',
    controlsCompleteDay: 5, aiPilotRequiredByDay: 6, comparisonCompleteDay: 8, decisionReadyDay: 9,
    costTreatment: '51个AI路径SKU中的首批5件已经包含，不重复计入；人工对照5件不计入交付SKU；追加40h对照+14h比较+最多2h裁决，失败返工须另批预算并后移经济门。全部由额外有资质资源池承担，不借用主生产线容量。若实际恰好等于7h对8h的规划中位用时，仅改善12.5%，不足15%；PASS情景必须另有真实测量达标，不能从预算自动推导。',
  };
}

export function deadlineLowerBoundPlan() {
  const culture = culturalReviewConfig();
  culture.technicalHours = 36;
  culture.culturalHours = { G1: 20, G2: 15, G3: 11, G4: 5 };
  culture.unavailable = {};
  const resourceOptions = { researchHours: 102, productionHours: 108, reviewHours: 72, culturalReview: culture };
  const dates = workdays(CALENDAR.start, 30, CALENDAR.excludedDates);
  const scenarios = [3, 0].map(delay => {
    const gate = { status: 'PASS', readyDay: 1, processingDaysAfterPilot: delay, evidenceRef: 'SIM-LOWER-BOUND-ONLY', approvalRef: 'SIM-NOT-REAL-APPROVAL', costReviewComplete: true };
    const probe = planCriticalPath({ ...resourceOptions, economicGate: gate, totalDays: 24, freezeDay: 23 });
    const day = probe.summary.last_approval_day;
    const plan = planCriticalPath({ ...resourceOptions, economicGate: gate, totalDays: day + 2, freezeDay: day + 1 });
    return { ...plan, completionDate: dates[day - 1], freezeDates: dates.slice(day, day + 2), proposedReleaseDate: dates[day + 2] };
  });
  const incremental = { research: 0, production: 0, technical: 0, cultural: { G1: 0, G2: 0, G3: 0, G4: 0 } };
  for (const d of scenarios[0].daily) {
    incremental.research += Math.max(0, d.used_h.research - 12);
    incremental.production += Math.max(0, d.used_h.production - 36);
    incremental.technical += Math.max(0, d.review_pools.technical_used_h - 12);
    for (const g of Object.keys(incremental.cultural)) incremental.cultural[g] += Math.max(0, d.review_pools.cultural_used_h[g] - 3);
  }
  return {
    label: '月初全50区的工期下界试算；真实ROI仍PENDING，所有加配和前置证据均未取得。',
    resourceOptions, scenarios, currentROIStatus: 'PENDING',
    lowerBoundProof: '保留三批串行质量门、每批一次返工、至少1日接力与2日返工等待：首批最早D6，下一批D11，最后一批D16。即使文化人力与历史经济证据无限充足，仍晚于9月30日D13；两日冻结另计。',
    incrementalEffectiveHoursAboveCurrentDailyPools: incremental,
    incrementalCostTreatment: '217h是改由新增峰值资源承担的既有工作量（90研究+72制作+24技术QA+31文化QA），不再加到382h主线或438h含对照预算。新增货币成本按这些小时对应的加急时薪差、资质核验/协调、最低预约/待命费与前置证据核验成本另计，报价缺失时不报金额；实际ROI仍未取得。',
  };
}

export function buildSubmissionPlan() {
  const calendar = workdays(CALENDAR.start, 80, CALENDAR.excludedDates);
  const currentDates = calendar.filter(date => date < CALENDAR.target);
  const originalDates = workdays('2026-09-03', 20);
  const experiment = controlExperimentPlan();
  const economicGate = { status: 'PASS', readyDay: experiment.decisionReadyDay, processingDaysAfterPilot: 3, evidenceRef: 'SIM-PAIRED-COST-RESULT', approvalRef: 'SIM-BUSINESS-APPROVAL', costReviewComplete: true };
  const resourceOptions = { researchHours: 12, productionHours: 36, reviewHours: 24, culturalReview: culturalReviewConfig() };
  const current = planCriticalPath({ ...resourceOptions, economicGate, totalDays: currentDates.length, freezeDay: currentDates.length - 1 });
  const pending = planCriticalPath({ ...resourceOptions, economicGate: { ...economicGate, status: 'PENDING', evidenceRef: null, approvalRef: null }, totalDays: currentDates.length, freezeDay: currentDates.length - 1 });
  const probe = planCriticalPath({ ...resourceOptions, economicGate, totalDays: 60, freezeDay: 59 });
  if (probe.summary.approved_skus !== 51) throw Error('Full scope requires another replan');
  const completedDay = probe.summary.last_approval_day;
  const extended = planCriticalPath({ ...resourceOptions, economicGate, totalDays: completedDay + 2, freezeDay: completedDay + 1 });
  return {
    label: 'Oxyra的交前规划补充；当前真实ROI证据为PENDING；以下通过情景均为预算与资源按时满足的模拟，尚未执行。',
    calendar: { ...CALENDAR, holidayAssumption: '只排除周末；没有代替各区域节假日与供应商工作日历，确认后必须按不可用日重排。', currentDates, originalDates, originalStartIsPast: originalDates[0] < CALENDAR.asOf, currentProductionDays: currentDates.length - 2 },
    riskGroups: RISK_GROUPS, experiment, deadlineLowerBound: deadlineLowerBoundPlan(),
    originalCapacityOnly: { productionActiveHours: 382, excludes: '人工对照/比较、语言技能约束、明确起止日期；原A-E作为容量对照保留' },
    currentDeadlineAssumedPass: current,
    currentDeadlineEvidencePending: pending,
    fullScopeConditionalReplan: { ...extended, completionDate: calendar[completedDay - 1], freezeDates: calendar.slice(completedDay, completedDay + 2), earliestProposedReleaseDate: calendar[completedDay + 2] },
    costCeiling: { productionActiveHours: 382, manualControlsHours: 40, comparisonHours: 14, adjudicationReserveHours: 2, totalReservedActiveHours: 438, note: '438h是本情景主动工时预算上限，包含最多2h裁决预留；未用预留不作为实付。货币费率、模型/GPU、素材授权、外包报价与最低预约费另计，按同一事件或发票去重。' },
  };
}
