export type EffectMode = 'idle' | 'rain' | 'fireworks';

export type ReactionScores = {
  smile: number;
  laugh: number;
  wink?: number;
};

export type HeadCollider = {
  x: number;
  y: number;
  rx: number;
  ry: number;
  vx: number;
  vy: number;
};

export type PhysicsParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
};

export function rocketVelocity(startY: number, targetY: number, gravity = 185) {
  return -Math.sqrt(2 * gravity * Math.max(1, startY - targetY + 24));
}

export function physicsSteps(elapsedMs: number): number[] {
  const seconds = Math.max(0, Math.min(.25, elapsedMs / 1000));
  const count = Math.max(1, Math.ceil(seconds / (1 / 120)));
  return Array.from({ length: count }, () => seconds / count);
}

// Intersect a particle segment with an ellipse moving at the measured head velocity.
export function collideSweptHead(particle: PhysicsParticle, from: {x:number;y:number}, head: HeadCollider | null, dt: number, restitution=.72, headFrom?: HeadCollider | null) {
  if (!head || head.rx <= 0 || head.ry <= 0) return false;
  const rx = head.rx + particle.radius, ry = head.ry + particle.radius;
  const sx = (from.x - (headFrom?.x ?? head.x - head.vx * dt)) / rx;
  const sy = (from.y - (headFrom?.y ?? head.y - head.vy * dt)) / ry;
  const dx = (particle.x - head.x) / rx - sx;
  const dy = (particle.y - head.y) / ry - sy;
  const a = dx*dx + dy*dy, b = 2*(sx*dx+sy*dy), c = sx*sx+sy*sy-1;
  if (c <= 0) return collideWithHead(particle, head, restitution);
  const disc=b*b-4*a*c;
  if (a < 1e-12 || disc < 0) return false;
  const t=(-b-Math.sqrt(disc))/(2*a);
  if (t < 0 || t > 1) return false;
  particle.x=head.x+(sx+dx*t)*rx*.999;
  particle.y=head.y+(sy+dy*t)*ry*.999;
  return collideWithHead(particle, head, restitution);
}

export const reactionThresholds = {
  smileEnter: 0.12,
  smileExit: 0.07,
  smileDwellMs: 140,
  laughEnter: 0.36,
  laughSmileFloor: 0.16,
  laughDwellMs: 180,
  fireworkCooldownMs: 1450,
} as const;

// An open smile is a proxy for a teeth-showing smile, NOT tooth detection.
export function scoreFaceReaction(smileShape: number, jawOpen: number, cheekSquint: number) {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return {
    smile: clamp(smileShape * 0.9 + cheekSquint * 0.1),
    laugh: clamp(Math.min(smileShape / 0.22, jawOpen / 0.075)) * 0.8,
  };
}

export function resolveEffectIntent(scores: ReactionScores): EffectMode {
  if ((scores.wink ?? 0) >= 0.55) return 'fireworks';
  if (
    scores.laugh >= reactionThresholds.laughEnter &&
    scores.smile >= reactionThresholds.laughSmileFloor
  )
    return 'fireworks';
  if (scores.smile >= reactionThresholds.smileEnter) return 'rain';
  return 'idle';
}

export function collideWithHead(
  particle: PhysicsParticle,
  collider: HeadCollider | null,
  restitution = 0.72,
): boolean {
  if (!collider || collider.rx <= 0 || collider.ry <= 0) return false;

  const dx = particle.x - collider.x;
  const dy = particle.y - collider.y;
  const expandedRx = collider.rx + particle.radius;
  const expandedRy = collider.ry + particle.radius;
  const distance =
    (dx * dx) / (expandedRx * expandedRx) +
    (dy * dy) / (expandedRy * expandedRy);
  if (distance >= 1) return false;

  const centered = Math.abs(dx) + Math.abs(dy) < 0.0001;
  const fallbackLength = Math.hypot(particle.vx, particle.vy) || 1;
  const gradientX = centered
    ? -particle.vx / fallbackLength
    : dx / (expandedRx * expandedRx);
  const gradientY = centered
    ? -particle.vy / fallbackLength
    : dy / (expandedRy * expandedRy);
  const gradientLength = Math.hypot(gradientX, gradientY) || 1;
  const normalX = gradientX / gradientLength;
  const normalY = gradientY / gradientLength;
  if (centered) {
    particle.x = collider.x + normalX * expandedRx;
    particle.y = collider.y + normalY * expandedRy;
  } else {
    const boundaryScale = 1 / Math.sqrt(Math.max(distance, 0.0001));
    particle.x = collider.x + dx * boundaryScale;
    particle.y = collider.y + dy * boundaryScale;
  }

  const relativeVelocityX = particle.vx - collider.vx;
  const relativeVelocityY = particle.vy - collider.vy;
  const normalVelocity =
    relativeVelocityX * normalX + relativeVelocityY * normalY;
  if (normalVelocity < 0) {
    particle.vx -= (1 + restitution) * normalVelocity * normalX;
    particle.vy -= (1 + restitution) * normalVelocity * normalY;
  }
  // The relative normal impulse already accounts for a moving head. Adding
  // head velocity again would inject energy during repeated depenetration.
  return true;
}

/** Consume each tracked motion segment once, divided consistently across physics steps. */
export function headSweepSteps(previous: HeadCollider | null, next: HeadCollider | null, count: number) {
  if (!next) return Array.from({ length: count }, () => ({ from: null, to: null }));
  const moving = previous && (previous.x !== next.x || previous.y !== next.y);
  const start = previous ?? next;
  const at = (t: number): HeadCollider => ({
    x: start.x + (next.x - start.x) * t, y: start.y + (next.y - start.y) * t,
    rx: start.rx + (next.rx - start.rx) * t, ry: start.ry + (next.ry - start.ry) * t,
    vx: moving ? next.vx : 0, vy: moving ? next.vy : 0,
  });
  return Array.from({ length: count }, (_, index) => ({ from: at(index / count), to: at((index + 1) / count) }));
}
