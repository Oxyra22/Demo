// Deterministic planning model. All dates, arrivals and resource values are assumptions.
export function simulate({ name='assumed', reviewHours=6, freezeDay=19, totalDays=20, unavailableDays=[], arrivalShift=0, reworkDelay=2 }={}) {
 if (!Number.isFinite(reviewHours)||reviewHours<=0||!Number.isInteger(freezeDay)||freezeDay<1||!Number.isInteger(totalDays)||totalDays<freezeDay||!Number.isInteger(reworkDelay)||reworkDelay<1) throw Error('Invalid planning parameters');
 const tasks=Array.from({length:51},(_,i)=>({id:`SIM-SKU-${String(i+1).padStart(3,'0')}`,parent:i===50?'REQ-017':`REQ-${String(i+1).padStart(3,'0')}`,arrival:3+Math.floor(i/4)+arrivalShift,needsRework:(i+1)%5===0,phase:'FIRST',ready:3+Math.floor(i/4)+arrivalShift,remaining:2,firstReviewDay:null,approvedDay:null}));
 const daily=[];
 for(let day=1;day<=totalDays;day++) {
  let available=day>=freezeDay||unavailableDays.includes(day)?0:reviewHours;
  const capacity=available;const events=[];
  const queue=tasks.filter(t=>!t.approvedDay&&t.ready<=day).sort((a,b)=>a.ready-b.ready||a.id.localeCompare(b.id));
  for(const t of queue) {
   if(available<=0)break; const spent=Math.min(available,t.remaining);t.remaining-=spent;available-=spent;
   events.push({task:t.id,phase:t.phase,hours:spent});
   if(t.remaining===0) {
    if(t.phase==='FIRST')t.firstReviewDay=day;
    if(t.phase==='FIRST'&&t.needsRework){t.phase='REWORK_REVIEW';t.ready=day+reworkDelay;t.remaining=1;}
    else{t.approvedDay=day;t.phase='APPROVED';}
   }
  }
  daily.push({day,phase:day>=freezeDay?'FREEZE':'PRODUCTION',new_arrivals:tasks.filter(t=>t.arrival===day).length,capacity_h:capacity,used_h:capacity-available,ready_queue:tasks.filter(t=>!t.approvedDay&&t.ready<=day).length,waiting_rework:tasks.filter(t=>!t.approvedDay&&t.ready>day&&t.firstReviewDay).length,approved_total:tasks.filter(t=>t.approvedDay).length,events});
 }
 const parents=[...new Set(tasks.map(t=>t.parent))];
 return {name,status:'PLANNING_SIMULATION',assumptions:{reviewHours,freezeDay,totalDays,unavailableDays,arrivalShift,reworkDelay,first_review_h:2,rework_review_h:1,rework_count:10},summary:{sku_total:51,region_total:50,approved_skus:tasks.filter(t=>t.approvedDay).length,approved_regions:parents.filter(id=>tasks.filter(t=>t.parent===id).every(t=>t.approvedDay)).length,deferred:tasks.filter(t=>!t.approvedDay).map(t=>t.id),last_approval_day:Math.max(0,...tasks.map(t=>t.approvedDay||0)),used_h:daily.reduce((s,d)=>s+d.used_h,0)},daily,tasks};
}
export function permission({policyValid=false,rightsClear=false,localReviewer=false,offlineBudgetApproved=false,internalDemandEvidence=false,qaComplete=false,releaseSigned=false}={}) {
 if(!policyValid||!rightsClear||!localReviewer)return 'RESEARCH_ONLY';
 if(!offlineBudgetApproved)return 'CONCEPT_REVIEW';
 if(qaComplete&&releaseSigned)return 'APPROVED_RELEASE_SCOPE';
 return internalDemandEvidence?'ASSISTED_BATCH_OFFLINE':'BOUNDED_COLD_START_OFFLINE';
}
export function qaStatus({kind,artifactHash,reportHash,evidenceRef,measurements={}}) {
 const required={mesh:['self_intersections','invalid_faces','triangle_count'],frames:['width','height','frame_count','alpha_checked'],player:['render_fps','frame_interval_p95_ms','payload_mb','device_id']}[kind];
 if(!required)return 'WRONG_ARTIFACT_TYPE';
 if(!artifactHash||artifactHash!==reportHash||!evidenceRef||required.some(k=>measurements[k]===undefined||measurements[k]===null))return 'PENDING_QA';
 if(kind==='mesh'&&(measurements.self_intersections>0||measurements.invalid_faces>0))return 'BLOCK';
 return 'EVIDENCE_COMPLETE_REQUIRES_THRESHOLD_AND_HUMAN_REVIEW';
}
