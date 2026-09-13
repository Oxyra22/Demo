export type CalibrationSignal = {
  smile: number;
  surprise: number;
  wink: number;
};

export type CalibrationRejectReason =
  | 'smile_active'
  | 'mouth_active'
  | 'wink_active';

export const CALIBRATION_TARGET_FRAMES = 36;
export const CALIBRATION_NO_FACE_TIMEOUT_MS = 6000;
export const CALIBRATION_PROGRESS_TIMEOUT_MS = 12000;

// Prototype guards for rejecting obviously expressive frames. These are not
// accuracy claims; the limits must be tuned with the real-camera field matrix.
export const neutralFrameLimits: CalibrationSignal = {
  smile: 0.09,
  surprise: 0.3,
  wink: 0.26,
};

export function adjustReactionScore(raw: number, baseline: number, kind: keyof CalibrationSignal) {
  const offset = kind === 'smile' ? Math.min(.02, baseline * .5) : baseline * .82;
  return Math.max(0, Math.min(1, (raw - offset) / Math.max(.52, 1 - baseline)));
}

export function assessNeutralFrame(signal: CalibrationSignal): {
  accepted: boolean;
  reason: CalibrationRejectReason | null;
} {
  if (signal.smile > neutralFrameLimits.smile)
    return { accepted: false, reason: 'smile_active' };
  if (signal.surprise > neutralFrameLimits.surprise)
    return { accepted: false, reason: 'mouth_active' };
  if (signal.wink > neutralFrameLimits.wink)
    return { accepted: false, reason: 'wink_active' };
  return { accepted: true, reason: null };
}

export function shouldFallbackFromCalibration(input: {
  startedAt: number;
  now: number;
  acceptedFrames: number;
  timedOut: boolean;
}) {
  return (
    !input.timedOut &&
    input.acceptedFrames < CALIBRATION_TARGET_FRAMES &&
    input.now - input.startedAt >= (input.acceptedFrames > 0
      ? CALIBRATION_PROGRESS_TIMEOUT_MS
      : CALIBRATION_NO_FACE_TIMEOUT_MS)
  );
}

export function calibrationPrompt(reason: CalibrationRejectReason | null) {
  if (reason === 'smile_active')
    return 'Return to a relaxed neutral expression';
  if (reason === 'mouth_active')
    return 'Close your mouth for neutral calibration';
  if (reason === 'wink_active') return 'Open both eyes for neutral calibration';
  return 'Hold a neutral face · personal calibration';
}
