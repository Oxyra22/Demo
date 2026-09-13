import assert from 'node:assert/strict';

import {
  collideWithHead,
  collideSweptHead,
  headSweepSteps,
  reactionThresholds,
  resolveEffectIntent,
  scoreFaceReaction,
} from '../lib/prompt-effects.ts';

let checks = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

check(
  resolveEffectIntent({ smile: 0.05, laugh: 0.03 }) === 'idle',
  'neutral must stay idle',
);
check(
  resolveEffectIntent({
    smile: reactionThresholds.smileEnter + 0.01,
    laugh: 0.12,
  }) === 'rain',
  'a natural smile must map to rain',
);
check(
  resolveEffectIntent({
    smile: 0.7,
    laugh: reactionThresholds.laughEnter + 0.01,
  }) === 'fireworks',
  'a big laugh must map to fireworks',
);
check(
  resolveEffectIntent({ smile: 0.12, laugh: 0.9 }) !== 'fireworks',
  'jaw opening without a smile must not count as a big laugh',
);

const collider = { x: 100, y: 100, rx: 30, ry: 44, vx: 0, vy: 0 };
const incoming = { x: 100, y: 70, vx: 0, vy: 180, radius: 3 };
check(
  collideWithHead(incoming, collider),
  'an incoming spark must hit the head collider',
);
check(
  incoming.y <= 53,
  'collision must push the spark outside the expanded ellipse',
);
check(incoming.vy < 0, 'collision must reflect velocity away from the head');

const miss = { x: 10, y: 10, vx: 20, vy: 30, radius: 2 };
check(!collideWithHead(miss, collider), 'a distant particle must not collide');
check(
  miss.vx === 20 && miss.vy === 30,
  'a missed particle must keep its velocity',
);

const movingCollider = { ...collider, vx: 45, vy: -12 };
const inherited = { x: 125, y: 100, vx: 0, vy: 0, radius: 3 };
collideWithHead(inherited, movingCollider);
check(
  inherited.vx > 0,
  'a spark must receive the moving head normal impulse',
);

check(resolveEffectIntent(scoreFaceReaction(0.15, 0.01, 0.03)) === 'rain', 'gentle closed smile gives rain');
check(resolveEffectIntent(scoreFaceReaction(0.23, 0.06, 0.03)) === 'fireworks', 'slight open smile gives fireworks');
check(resolveEffectIntent(scoreFaceReaction(0.04, 0.5, 0.02)) === 'idle', 'speech-like jaw without smile stays idle');
check(resolveEffectIntent(scoreFaceReaction(0.6, 0.01, 0.03)) === 'rain', 'closed broad smile alone is not laugh');
for (const count of [4, 8, 16]) {
  const a = { x:100, y:100, rx:50, ry:80, vx:0, vy:0 };
  const b = { ...a, x:220, vx:1000 };
  const particle = { x:160, y:100, vx:0, vy:0, radius:2 };
  let hit = false;
  for (const segment of headSweepSteps(a, b, count)) {
    const from = { x:particle.x, y:particle.y };
    particle.x += particle.vx * .032/count;
    particle.y += particle.vy * .032/count;
    if (collideSweptHead(particle, from, segment.to, .032/count, .72, segment.from)) hit = true;
  }
  check(hit, `120 ms head motion is consumed across ${count} substeps`);
  check(particle.vx <= 1720.001, 'subdivision must not inject extra energy');
  const stale = headSweepSteps(b, b, count);
  check(stale.every(step => step.from.x === 220 && step.to.x === 220 && step.to.vx === 0), 'stale samples have no repeated sweep or velocity');
  check(headSweepSteps(null, { ...b, x:500 }, count).every(step => step.from.x === 500), 'reacquisition never sweeps from an old head');
}
console.log(`Prompt-faithful effect checks passed: ${checks}/${checks}`);
