import type { PerformanceSummary } from './performance-monitor';

export type QualityTier = 'high' | 'mid' | 'low';
export type QualityMode = 'auto' | QualityTier;
export type LandmarkPoint = { x: number; y: number };

export const qualityPolicies: Record<QualityTier, {
  particles: number;
  motifs: number;
  tiltDistancePx: number;
}> = {
  high: { particles: 34, motifs: 12, tiltDistancePx: 24 },
  mid: { particles: 18, motifs: 8, tiltDistancePx: 16 },
  low: { particles: 0, motifs: 6, tiltDistancePx: 0 },
};

export function headRollDegrees(landmarks: LandmarkPoint[]) {
  const leftEyeOuter = landmarks[33];
  const rightEyeOuter = landmarks[263];
  if (!leftEyeOuter || !rightEyeOuter) return null;
  return Math.atan2(rightEyeOuter.y - leftEyeOuter.y, rightEyeOuter.x - leftEyeOuter.x) * 180 / Math.PI;
}

export function normalizeHeadTilt(deltaDegrees: number, mirrored = true) {
  const direction = mirrored ? -1 : 1;
  const magnitude = Math.abs(deltaDegrees);
  if (magnitude <= 6) return 0;
  const normalized = Math.min(1, (magnitude - 6) / 16);
  return Math.sign(deltaDegrees) * normalized * direction;
}

export function recommendQualityTier(summary: PerformanceSummary): QualityTier | null {
  if (summary.sampleDurationMs < 5000 || summary.inferenceFps === null || summary.detectionP95Ms === null) return null;
  // Healthy 8–15 Hz inference must not trigger a 30 FPS rendering alarm.
  if ((summary.renderFrameP95Ms ?? 0) > 65 || (summary.inferenceLateRate ?? 0) > 0.3 || summary.detectionP95Ms > 40) return 'low';
  if ((summary.renderFrameP95Ms ?? 0) > 45 || (summary.inferenceLateRate ?? 0) > 0.1 || summary.detectionP95Ms > 22 || (summary.nextPaintP95Ms ?? 0) > 50) return 'mid';
  return 'high';
}

export function shouldApplyRecommendation(current: QualityTier, recommended: QualityTier, stableWindows: number) {
  const rank: Record<QualityTier, number> = { low: 0, mid: 1, high: 2 };
  if (rank[recommended] < rank[current]) return true;
  return rank[recommended] > rank[current] && stableWindows >= 2;
}
