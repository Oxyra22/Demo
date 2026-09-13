// Deterministic capacity planning only. No actual production, policy or identity service.
export const ROLES = ['research', 'production', 'review'];
export const DEFAULTS = Object.freeze({
  totalDays: 20, freezeDay: 19, researchHours: 6, productionHours: 12,
  reviewHours: 6, handoffDays: 1, reworkWaitDays: 2, batchApprovalDays: 1,
  evidenceDelayDays: 0, unavailable: {}, economicGate: null, culturalReview: null,
});
const STAGES = {
  RESEARCH: { role: 'research', hours: 2 },
  PRODUCTION: { role: 'production', hours: 3 },
  FIRST_REVIEW: { role: 'review', hours: 2 },
  REWORK_PRODUCTION: { role: 'production', hours: 1.5 },
  FINAL_REVIEW: { role: 'review', hours: 1 },
};
const sum = values => values.reduce((a, b) => a + b, 0);
const sumRoles = values => ({ ...values, total: sum(ROLES.map(r => values[r])) });

export function planCriticalPath(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  for (const k of ['totalDays', 'freezeDay', 'handoffDays', 'reworkWaitDays', 'batchApprovalDays']) {
    if (!Number.isInteger(cfg[k]) || cfg[k] < 1) throw Error(`Invalid ${k}`);
  }
  if (cfg.freezeDay > cfg.totalDays || !Number.isInteger(cfg.evidenceDelayDays) || cfg.evidenceDelayDays < 0) throw Error('Invalid horizon or evidence delay');
  for (const r of ROLES) {
    if (!Number.isFinite(cfg[`${r}Hours`]) || cfg[`${r}Hours`] <= 0) throw Error(`Invalid ${r} capacity`);
    if (cfg.unavailable[r] && (!Array.isArray(cfg.unavailable[r]) || cfg.unavailable[r].some(d => !Number.isInteger(d) || d < 1))) throw Error('Invalid unavailable day');
  }
  const economic = cfg.economicGate;
  if (economic && (!['PASS', 'PENDING', 'FAIL'].includes(economic.status) || !Number.isInteger(economic.readyDay) || economic.readyDay < 1)) throw Error('Invalid economic gate');
  if (economic && (!Number.isInteger(economic.processingDaysAfterPilot ?? 0) || (economic.processingDaysAfterPilot ?? 0) < 0)) throw Error('Invalid economic dependency delay');
  if (economic?.status === 'PASS' && (![economic.evidenceRef, economic.approvalRef].every(v => typeof v === 'string' && v.trim()) || economic.costReviewComplete !== true)) throw Error('Economic pass requires evidence, approval and cost review');
  const culture = cfg.culturalReview;
  if (culture) {
    if (!Number.isFinite(culture.technicalHours) || culture.technicalHours <= 0 || !culture.culturalHours || !culture.groupForRequest) throw Error('Invalid cultural review pools');
    for (const [group, hours] of Object.entries(culture.culturalHours)) {
      if (!Number.isFinite(hours) || hours <= 0) throw Error('Invalid cultural capacity');
      const unavailable = culture.unavailable?.[group] || [];
      if (!Array.isArray(unavailable) || unavailable.some(d => !Number.isInteger(d) || d < 1)) throw Error('Invalid cultural unavailable days');
    }
    if (!Number.isInteger(culture.maxUnavailableWaitDays) || culture.maxUnavailableWaitDays < 1) throw Error('Invalid cultural waiting limit');
    for (let n = 1; n <= 50; n++) if (!Object.hasOwn(culture.culturalHours, culture.groupForRequest[`REQ-${String(n).padStart(3, '0')}`])) throw Error('Missing qualified review group');
  }
  const tasks = Array.from({ length: 51 }, (_, i) => {
    const number = i + 1, needsRework = number % 5 === 0;
    const parent = number === 51 ? 'REQ-017' : `REQ-${String(number).padStart(3, '0')}`;
    const stageNames = ['RESEARCH', 'PRODUCTION', 'FIRST_REVIEW', ...(needsRework ? ['REWORK_PRODUCTION', 'FINAL_REVIEW'] : [])];
    return {
      id: `SIM-SKU-${String(number).padStart(3, '0')}`,
      parent, reviewGroup: culture?.groupForRequest[parent] || null,
      batch: number <= 5 ? 'PILOT_5' : number <= 15 ? 'ASSIST_10' : 'SCALE_36',
      budgetScope: number <= 5 ? 'OFFLINE_PILOT_5' : number <= 15 ? 'OFFLINE_ASSIST_10' : `OFFLINE_SCALE_${Math.floor((number - 16) / 10) + 1}`,
      needsRework, briefReadyDay: 1 + cfg.evidenceDelayDays,
      // One early task illustrates safety documents/budget arriving later than research.
      offlinePermissionReadyDay: (number === 1 ? 3 : 1) + cfg.evidenceDelayDays,
      stageIndex: 0, approvedDay: null, unavailableReviewDays: 0, holdReason: null,
      stages: stageNames.map(name => ({ name, ...STAGES[name], remaining: STAGES[name].hours, readyDay: name === 'RESEARCH' ? 1 + cfg.evidenceDelayDays : null, startDay: null, completedDay: null })),
    };
  });
  const previousBatch = { ASSIST_10: 'PILOT_5', SCALE_36: 'ASSIST_10' };
  function batchReadyDay(task) {
    const predecessor = previousBatch[task.batch];
    if (!predecessor) return 1;
    const before = tasks.filter(t => t.batch === predecessor);
    return before.every(t => t.approvedDay !== null) ? Math.max(...before.map(t => t.approvedDay)) + cfg.batchApprovalDays : Infinity;
  }
  function gate(task) {
    if (task.approvedDay !== null) return { ready: Infinity, reason: 'APPROVED' };
    if (task.holdReason) return { ready: Infinity, reason: task.holdReason };
    const s = task.stages[task.stageIndex];
    if (s.name === 'RESEARCH') return { ready: s.readyDay, reason: 'BRIEF_WAIT' };
    if (s.name === 'PRODUCTION') {
      const permission = task.offlinePermissionReadyDay, batch = batchReadyDay(task);
      const pilot = tasks.filter(t => t.batch === 'PILOT_5');
      const pilotEvidenceDay = pilot.every(t => t.approvedDay !== null) ? Math.max(...pilot.map(t => t.approvedDay)) + (economic?.processingDaysAfterPilot ?? 0) : Infinity;
      const economics = !economic || task.batch === 'PILOT_5' ? 1 : economic.status === 'PASS' ? Math.max(economic.readyDay, pilotEvidenceDay) : Infinity;
      const ready = Math.max(s.readyDay, permission, batch, economics);
      return { ready, reason: economics === ready ? 'ECONOMIC_EVIDENCE_OR_APPROVAL_WAIT' : batch === ready ? 'PREVIOUS_BATCH_APPROVAL_WAIT' : permission === ready ? 'SAFETY_AND_OFFLINE_PERMISSION_WAIT' : 'HANDOFF_WAIT' };
    }
    return { ready: s.readyDay, reason: s.name === 'REWORK_PRODUCTION' ? 'REWORK_WAIT' : 'HANDOFF_WAIT' };
  }
  const daily = [], events = [];
  for (let day = 1; day <= cfg.totalDays; day++) {
    const capacity = Object.fromEntries(ROLES.map(r => [r, day >= cfg.freezeDay || (cfg.unavailable[r] || []).includes(day) ? 0 : cfg[`${r}Hours`]]));
    const used = Object.fromEntries(ROLES.map(r => [r, 0]));
    const culturalCapacity = culture ? Object.fromEntries(Object.entries(culture.culturalHours).map(([g, h]) => [g, capacity.review === 0 || culture.unavailable?.[g]?.includes(day) ? 0 : h])) : {};
    const culturalUsed = Object.fromEntries(Object.keys(culturalCapacity).map(g => [g, 0]));
    let technicalUsed = 0;
    if (culture && capacity.review > 0) for (const task of tasks) {
      if (task.approvedDay !== null || task.holdReason || task.stages[task.stageIndex].role !== 'review' || gate(task).ready > day) continue;
      task.unavailableReviewDays = culturalCapacity[task.reviewGroup] === 0 ? task.unavailableReviewDays + 1 : 0;
      if (task.unavailableReviewDays > culture.maxUnavailableWaitDays) task.holdReason = 'CULTURAL_OWNER_SLA_EXCEEDED_REPLAN';
    }
    const reviewRoom = task => culture ? Math.max(0, Math.min((culture.technicalHours - technicalUsed) * 2, (culturalCapacity[task.reviewGroup] - culturalUsed[task.reviewGroup]) * 2)) : Infinity;
    // Every transfer takes at least one workday, so this iteration order gives no same-day shortcut.
    for (const role of ROLES) {
      const queue = tasks.filter(t => t.approvedDay === null && t.stages[t.stageIndex].role === role && gate(t).ready <= day)
        .sort((a, b) => gate(a).ready - gate(b).ready || a.id.localeCompare(b.id));
      for (const t of queue) {
        const roleAvailable = capacity[role] - used[role];
        if (roleAvailable <= 0) break;
        const available = role === 'review' ? Math.min(roleAvailable, reviewRoom(t)) : roleAvailable;
        if (available <= 0) continue;
        const s = t.stages[t.stageIndex], hours = Math.min(s.remaining, available);
        s.startDay ??= day;
        s.remaining -= hours; used[role] += hours;
        const event = { day, task: t.id, batch: t.batch, stage: s.name, role, hours };
        if (role === 'review' && culture) {
          // 综合首审2h拆为技术1h和文化1h；复审1h按同一比例计入两类资源。
          technicalUsed += hours / 2;
          culturalUsed[t.reviewGroup] += hours / 2;
          Object.assign(event, { review_group: t.reviewGroup, technical_h: hours / 2, cultural_h: hours / 2 });
        }
        events.push(event);
        if (s.remaining === 0) {
          s.completedDay = day;
          if (t.stageIndex === t.stages.length - 1) t.approvedDay = day;
          else {
            const next = t.stages[++t.stageIndex];
            next.readyDay = day + (next.name === 'REWORK_PRODUCTION' ? cfg.reworkWaitDays : cfg.handoffDays);
          }
        }
      }
    }
    const waiting = {};
    for (const t of tasks.filter(t => t.approvedDay === null)) {
      const g = gate(t), key = day >= cfg.freezeDay ? 'FREEZE' : g.ready <= day ? culture && t.stages[t.stageIndex].role === 'review' && reviewRoom(t) <= 0 ? 'QUALIFIED_CULTURAL_REVIEW_WAIT' : 'READY_WAIT_CAPACITY' : g.reason;
      waiting[key] = (waiting[key] || 0) + 1;
    }
    daily.push({ day, phase: day >= cfg.freezeDay ? 'FREEZE' : 'PRODUCTION', capacity_h: sumRoles(capacity), used_h: sumRoles(used), approved_skus: tasks.filter(t => t.approvedDay !== null).length, waiting,
      ...(culture ? { review_pools: { technical_capacity_h: capacity.review === 0 ? 0 : culture.technicalHours, technical_used_h: technicalUsed, cultural_capacity_h: culturalCapacity, cultural_used_h: culturalUsed } } : {}) });
  }
  const rolesTotal = selector => sumRoles(Object.fromEntries(ROLES.map(role => [role, sum(tasks.flatMap(t => t.stages).filter(s => s.role === role).map(selector))])));
  const planned = rolesTotal(s => s.hours), remaining = rolesTotal(s => s.remaining);
  const spent = sumRoles(Object.fromEntries(ROLES.map(r => [r, planned[r] - remaining[r]])));
  const parents = [...new Set(tasks.map(t => t.parent))];
  const batches = ['PILOT_5', 'ASSIST_10', 'SCALE_36'].map(batch => {
    const subset = tasks.filter(t => t.batch === batch), complete = subset.every(t => t.approvedDay !== null);
    return { batch, total: subset.length, approved: subset.filter(t => t.approvedDay !== null).length, complete_day: complete ? Math.max(...subset.map(t => t.approvedDay)) : null };
  });
  return {
    mode: 'PLANNING_SIMULATION_NO_REAL_PRODUCTION', assumptions: cfg,
    workload_assumptions: { sku_total: 51, region_total: 50, first_research_h: 2, first_production_h: 3, first_review_h: 2, rework_skus: 10, rework_production_h: 1.5, rework_review_h: 1, batching: '5 accepted -> next workday budget decision -> 10 accepted -> next workday separate 10+10+10+6 budget decisions for the final 36; all decisions assumed granted, never real approvals', role_capacity: 'Aggregate effective team hours per workday; not hours per individual', policy_wait: 'Research may proceed; production awaits safety evidence and offline budget. SIM-SKU-001 ready on day 3; all others day 1, plus evidenceDelayDays.', scheduling: 'FIFO by ready day and SKU; partial work may span days; unused daily capacity expires; every handoff consumes >=1 workday; repeat rework beyond one cycle is excluded. Initial review 2h aggregates all required QA/local/rights functions; actual coverage, numeric measurement and signatures remain unverified.' },
    summary: {
      approved_skus: tasks.filter(t => t.approvedDay !== null).length,
      approved_regions: parents.filter(p => tasks.filter(t => t.parent === p).every(t => t.approvedDay !== null)).length,
      last_approval_day: Math.max(0, ...tasks.map(t => t.approvedDay || 0)),
      planned_active_h: planned, spent_active_h: spent, remaining_active_h: remaining,
      deferred: tasks.filter(t => t.approvedDay === null).map(t => ({ id: t.id, parent: t.parent, stage: t.stages[t.stageIndex].name, stage_remaining_h: t.stages[t.stageIndex].remaining, ready_day: Number.isFinite(gate(t).ready) ? gate(t).ready : null, gate: gate(t).reason })),
      batches, published: false,
    }, daily, events, tasks,
  };
}

export const SCENARIOS = [
  { name: 'A_原等效人力', options: { researchHours: 6, productionHours: 12, reviewHours: 6 } },
  { name: 'B_仅增加审核', options: { researchHours: 6, productionHours: 12, reviewHours: 9 } },
  { name: 'C_研究制作审核均增配', options: { researchHours: 9, productionHours: 18, reviewHours: 9 } },
  { name: 'D_C配置但补证等待3日', options: { researchHours: 9, productionHours: 18, reviewHours: 9, evidenceDelayDays: 3 } },
];

export function createScenarioReport() {
  const fixed = planCriticalPath({ researchHours: 12, productionHours: 36, reviewHours: 24 });
  const baseline = { research: 6, production: 12, review: 6 };
  const incremental = Object.fromEntries(ROLES.map(role => [role, sum(fixed.daily.map(d => Math.max(0, d.used_h[role] - baseline[role])))]));
  const delayedFixed = planCriticalPath({ researchHours: 12, productionHours: 36, reviewHours: 24, evidenceDelayDays: 3 });
  return {
    label: 'oxyra的确定性完整关键路径规划；所有人数、有效工时、审批延迟和返工为假设；未执行真实制作或审批。',
    cases: SCENARIOS.map(({ name, options }) => {
      const result = planCriticalPath(options);
      const extension = planCriticalPath({ ...options, totalDays: 60, freezeDay: 59 });
      return { name, ...result, extended_deadline_scenario: { label: '假设发布冻结移后，保持相同资源与规则继续排程；不代表原期限内可交付', full_completion_day: extension.summary.approved_skus === 51 ? extension.summary.last_approval_day : null, spent_active_h: extension.summary.spent_active_h } };
    }),
    fixed_deadline_plan: {
      name: 'E_原期限内分阶段增援', ...fixed,
      resource_plan: {
        effective_h_per_person_day: 6,
        role_pool_people: { research: 2, production: 6, review: 4 },
        label: '分阶段预约的角色资源池；并非12人全程投入；不主张全局最少人力。',
        incremental_effective_h_above_original_daily_capacity: sumRoles(incremental),
        incremental_cost_formula: '48 * research_hourly_rate + 90 * production_hourly_rate + 70 * QA_hourly_rate + actual coordination/minimum-booking/expedite fees',
        pricing_status: 'No real hourly rates or supplier prices supplied. Only scheduled effective hours are calculated.',
        waiting_and_rework: 'Unchanged: all three stage handoffs, initial permission delay, 5->10->36 approval gates, 10 rework-production stages at 1.5h and re-reviews at 1h remain included.',
        release_precondition: 'All rostered skills and local QA coverage available on specified days; actual quality, policy and budget approval required. No full workday slack before day-19 freeze.',
      },
      three_day_evidence_delay_stress: { approved_skus: delayedFixed.summary.approved_skus, approved_regions: delayedFixed.summary.approved_regions, deferred: delayedFixed.summary.deferred.map(t => t.id) },
    },
  };
}
