import { buildSubmissionPlan } from '../planning/submission-plan.mjs';
const r = buildSubmissionPlan();
console.log(JSON.stringify(process.argv.includes('--full') ? r : {
  label: r.label,
  scope: { required_regions: 50, planned_skus: 51, scope_change_approved: false },
  calendar: r.calendar,
  current_deadline_assumed_pass: r.currentDeadlineAssumedPass.summary,
  current_deadline_evidence_pending: r.currentDeadlineEvidencePending.summary,
  full_scope_conditional_replan: {
    summary: r.fullScopeConditionalReplan.summary,
    completion_date: r.fullScopeConditionalReplan.completionDate,
    freeze_dates: r.fullScopeConditionalReplan.freezeDates,
    earliest_proposed_release_date: r.fullScopeConditionalReplan.earliestProposedReleaseDate
  },
  cost_ceiling: r.costCeiling
}, null, 2));
