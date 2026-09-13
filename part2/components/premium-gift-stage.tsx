'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import Image from 'next/image';

import type { HeadCollider } from '@/lib/prompt-effects';

export type PremiumGiftPhase =
  | 'idle'
  | 'face-lock'
  | 'arrival'
  | 'approach'
  | 'kiss'
  | 'sparkle'
  | 'complete';

type PremiumGiftStageProps = {
  runId: number;
  faceCollider: HeadCollider | null;
  cameraActive: boolean;
  reduceMotion: boolean;
  onPhaseChange?: (phase: PremiumGiftPhase) => void;
};

export const premiumGiftTimeline = {
  durationMs: 6600,
  faceLockEndMs: 650,
  arrivalEndMs: 1900,
  approachEndMs: 4500,
  kissEndMs: 5300,
  sparkleEndMs: 6200,
} as const;

const previewFace: HeadCollider = {
  x: 0.5,
  y: 0.34,
  rx: 0.135,
  ry: 0.18,
  vx: 0,
  vy: 0,
};

const sparkleSeeds = [
  [9, 64, 0.86, -0.4],
  [17, 45, 0.58, -1.2],
  [27, 72, 0.72, -0.8],
  [36, 55, 0.48, -1.6],
  [47, 77, 0.64, -0.2],
  [58, 61, 0.88, -1.1],
  [69, 74, 0.54, -0.5],
  [78, 49, 0.76, -1.8],
  [88, 68, 0.62, -0.9],
  [23, 28, 0.44, -1.4],
  [73, 25, 0.52, -0.6],
  [92, 34, 0.4, -1.9],
] as const;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function phaseFromElapsed(elapsedMs: number): PremiumGiftPhase {
  if (elapsedMs < 0) return 'idle';
  if (elapsedMs < premiumGiftTimeline.faceLockEndMs) return 'face-lock';
  if (elapsedMs < premiumGiftTimeline.arrivalEndMs) return 'arrival';
  if (elapsedMs < premiumGiftTimeline.approachEndMs) return 'approach';
  if (elapsedMs < premiumGiftTimeline.kissEndMs) return 'kiss';
  if (elapsedMs < premiumGiftTimeline.sparkleEndMs) return 'sparkle';
  if (elapsedMs < premiumGiftTimeline.durationMs) return 'sparkle';
  return 'complete';
}

export function PremiumGiftStage({
  runId,
  faceCollider,
  cameraActive,
  reduceMotion,
  onPhaseChange,
}: PremiumGiftStageProps) {
  const callbackRef = useRef(onPhaseChange);
  const faceStateRef = useRef({
    cameraActive,
    hasLiveFace: Boolean(faceCollider),
  });
  const [phase, setPhase] = useState<PremiumGiftPhase>('idle');

  useEffect(() => {
    callbackRef.current = onPhaseChange;
  }, [onPhaseChange]);

  useEffect(() => {
    faceStateRef.current = {
      cameraActive,
      hasLiveFace: Boolean(faceCollider),
    };
  }, [cameraActive, faceCollider]);

  useEffect(() => {
    if (runId <= 0) {
      return;
    }

    const requestedAt = performance.now();
    let startedAt = -1;
    let currentPhase: PremiumGiftPhase = 'idle';
    let frame = 0;

    const announce = (nextPhase: PremiumGiftPhase) => {
      if (nextPhase === currentPhase) return;
      currentPhase = nextPhase;
      setPhase(nextPhase);
      callbackRef.current?.(nextPhase);
    };

    const render = (now: number) => {
      const faceState = faceStateRef.current;
      const waitForLiveFace = faceState.cameraActive && !faceState.hasLiveFace;
      const faceWaitExpired = now - requestedAt > 1800;
      if (startedAt < 0 && (!waitForLiveFace || faceWaitExpired))
        startedAt = now;

      if (startedAt < 0) announce('face-lock');
      else announce(phaseFromElapsed(now - startedAt));

      if (startedAt < 0 || now - startedAt < premiumGiftTimeline.durationMs)
        frame = requestAnimationFrame(render);
    };

    if (reduceMotion) {
      const announceFrame = requestAnimationFrame(() => announce('kiss'));
      const timeout = window.setTimeout(() => announce('complete'), 1600);
      return () => {
        cancelAnimationFrame(announceFrame);
        window.clearTimeout(timeout);
      };
    }

    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, runId]);

  const face = faceCollider ?? previewFace;
  const cheekX = clamp(face.x + face.rx * 0.78, 0.18, 0.76);
  const cheekY = clamp(face.y + face.ry * 0.14, 0.18, 0.72);
  const stageStyle = {
    '--face-x': `${face.x * 100}%`,
    '--face-y': `${face.y * 100}%`,
    '--face-w': `${face.rx * 200}%`,
    '--face-h': `${face.ry * 200}%`,
    '--cheek-x': `${cheekX * 100}%`,
    '--cheek-y': `${cheekY * 100}%`,
  } as CSSProperties;
  const hasLiveFace = Boolean(faceCollider);
  const phaseCopy: Record<PremiumGiftPhase, string> = {
    idle: 'Ready to find a face',
    'face-lock': hasLiveFace ? 'Face found' : 'Finding a face…',
    arrival: 'A tiny ghost appeared',
    approach: 'It is coming closer',
    kiss: 'Mwah!',
    sparkle: 'Ghost Kiss delivered',
    complete: 'Replay when ready',
  };

  return (
    <div
      className={`premium-gift-stage ghost-kiss-stage ghost-phase-${phase}`}
      data-premium-phase={phase}
      data-face-source={hasLiveFace ? 'live' : 'preview'}
      style={stageStyle}
      aria-live="polite"
    >
      <div className="ghost-kiss-night" aria-hidden="true" />
      <div
        className="ghost-kiss-beam ghost-kiss-beam-cyan"
        aria-hidden="true"
      />
      <div
        className="ghost-kiss-beam ghost-kiss-beam-pink"
        aria-hidden="true"
      />

      <div
        className={`ghost-face-target ${hasLiveFace ? 'is-live' : 'is-preview'}`}
        aria-hidden="true"
      >
        <div className="ghost-preview-face">
          <i />
          <i />
          <b />
        </div>
        <span>{hasLiveFace ? 'LIVE FACE' : 'PREVIEW FACE'}</span>
      </div>

      <div className="ghost-sparkle-field" aria-hidden="true">
        {sparkleSeeds.map(([x, y, scale, delay], index) => (
          <i
            key={`${x}-${y}`}
            className={index % 3 === 0 ? 'is-pink' : 'is-cyan'}
            style={
              {
                '--spark-x': `${x}%`,
                '--spark-y': `${y}%`,
                '--spark-scale': scale,
                '--spark-delay': `${delay}s`,
              } as CSSProperties
            }
          >
            ✦
          </i>
        ))}
      </div>

      <div className="ghost-flight-trail" aria-hidden="true" />
      <Image
        className="ghost-kiss-actor"
        src="/gifts/premium-v01/frosted-ghost.webp"
        alt=""
        width={1244}
        height={1264}
        draggable={false}
        aria-hidden="true"
      />

      <div className="ghost-kiss-burst" aria-hidden="true">
        <span>♥</span>
        <i />
        <b>✦</b>
      </div>

      <div className="ghost-gift-ribbon">
        <span className="ghost-gift-avatar">N</span>
        <span>
          <b>NovaMuse</b>
          <small>sent Ghost Kiss</small>
        </span>
        <i>✦</i>
      </div>
      <div className="ghost-phase-label">{phaseCopy[phase]}</div>
    </div>
  );
}
