'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { Download } from 'lucide-react';

import { PromptEffectsCanvas } from '@/components/prompt-effects-canvas';
import { GhostStudio } from '@/components/ghost-studio';
import { WeatherStudio } from '@/components/weather-studio';
import { DEMO_VERSION } from '@/lib/release';
import { awaitOwnedResource, CAMERA_TIMEOUTS, videoHasStalled } from '@/lib/camera-session';
import { projectFacePoint, type FaceAnchors } from '@/lib/face-projection';
import {
  CALIBRATION_TARGET_FRAMES,
  assessNeutralFrame,
  adjustReactionScore,
  calibrationPrompt,
  shouldFallbackFromCalibration,
  type CalibrationRejectReason,
} from '@/lib/calibration-gate';
import {
  classifyCameraStartError,
  type CameraFailureReason,
  type CameraStartPhase,
} from '@/lib/camera-fallback';
import {
  headRollDegrees,
  normalizeHeadTilt,
  recommendQualityTier,
  shouldApplyRecommendation,
  type QualityMode,
  type QualityTier,
} from '@/lib/movement-quality';
import {
  createPerformanceBuffers,
  recordBoundedSample,
  summarizePerformance,
  type PerformanceSummary,
} from '@/lib/performance-monitor';
import {
  reactionThresholds,
  scoreFaceReaction,
  resolveEffectIntent,
  type EffectMode,
  type HeadCollider,
} from '@/lib/prompt-effects';

type Scores = { smile: number; surprise: number; wink: number };
type TelemetryEvent = {
  event: string;
  at: number;
  detail?: Record<string, string | number | boolean | null>;
};

const emptyScores: Scores = { smile: 0, surprise: 0, wink: 0 };
const emptyCalibrationRejections: Record<CalibrationRejectReason, number> = {
  smile_active: 0,
  mouth_active: 0,
  wink_active: 0,
};
const faceOvalIndices = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378,
  400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21,
  54, 103, 67, 109,
];
const manualCollider: HeadCollider = {
  x: 0.5,
  y: 0.47,
  rx: 0.242,
  ry: 0.112,
  vx: 0,
  vy: 0,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function colliderFromLandmarks(
  landmarks: Array<{ x: number; y: number }>,
  previous: HeadCollider | null,
  deltaSeconds: number,
  video?: HTMLVideoElement,
): HeadCollider | null {
  const points = faceOvalIndices
    .map((index) => landmarks[index])
    .filter(Boolean);
  if (points.length < 12) return null;
  const displayed = points.map((point) =>
    video && video.clientWidth && video.videoWidth
      ? projectFacePoint(
          point,
          video.videoWidth,
          video.videoHeight,
          video.clientWidth,
          video.clientHeight,
        )
      : { x: 1 - point.x, y: point.y },
  );
  const xs = displayed.map((point) => point.x);
  const ys = displayed.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const x = clamp01((minX + maxX) / 2);
  const y = clamp01((minY + maxY) / 2 - (maxY - minY) * 0.08);
  const rx = Math.max(0.07, (maxX - minX) * 0.58);
  const ry = Math.max(0.1, (maxY - minY) * 0.64);
  const safeDelta = Math.max(1 / 120, deltaSeconds);
  return {
    x,
    y,
    rx,
    ry,
    vx: previous ? (x - previous.x) / safeDelta : 0,
    vy: previous ? (y - previous.y) / safeDelta : 0,
  };
}

function SignalBar({
  label,
  value,
  threshold,
  color,
}: {
  label: string;
  value: number;
  threshold: number;
  color: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[10px] text-white/48">
        <span>{label}</span>
        <span className="font-mono text-white/68">
          {Math.round(value * 100)} / {Math.round(threshold * 100)}
        </span>
      </div>
      <div className="relative h-1.5 overflow-hidden rounded-full bg-white/7">
        <div
          className="h-full rounded-full transition-[width] duration-100"
          style={{ width: `${value * 100}%`, background: color }}
        />
        <i
          className="absolute top-0 h-full w-px bg-white/80"
          style={{ left: `${threshold * 100}%` }}
        />
      </div>
    </div>
  );
}

export function ReactionWeatherDemo({
  experience,
}: {
  experience: 'standard' | 'premium';
}) {
  const isPremium = experience === 'premium';
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraStartingRef = useRef(false);
  const cameraSessionRef = useRef<AbortController | null>(null);
  const lastVideoProgressAtRef = useRef(0);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const frameRef = useRef<number | null>(null);
  const analyseFrameRef = useRef<() => void>(() => undefined);
  const lastVideoTimeRef = useRef(-1);
  const lastInferenceAtRef = useRef(0);
  const lastFaceSeenRef = useRef(0);
  const lastColliderAtRef = useRef(0);
  const colliderRef = useRef<HeadCollider | null>(null);
  const baselineRef = useRef<Scores>({ ...emptyScores });
  const smoothedRef = useRef<Scores>({ ...emptyScores });
  const calibrationFramesRef = useRef(0);
  const calibrationStartedAtRef = useRef(0);
  const calibrationTimedOutRef = useRef(false);
  const calibrationRejectedRef = useRef({ ...emptyCalibrationRejections });
  const effectModeRef = useRef<EffectMode>('idle');
  const candidateRef = useRef<{
    id: 'rain' | 'fireworks' | null;
    since: number;
  }>({ id: null, since: 0 });
  const fireworksUntilRef = useRef(0);
  const lastFireworkAtRef = useRef(0);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const performanceBuffersRef = useRef(createPerformanceBuffers());
  const performanceStartedAtRef = useRef(0);
  const lastProcessedFrameAtRef = useRef(0);
  const pendingFeedbackRef = useRef<{
    action: 'rain' | 'fireworks';
    detectedAt: number;
  } | null>(null);
  const qualityModeRef = useRef<QualityMode>('auto');
  const qualityTierRef = useRef<QualityTier>('mid');
  const qualityRecommendationRef = useRef<{
    tier: QualityTier | null;
    windows: number;
  }>({ tier: null, windows: 0 });

  const [cameraOn, setCameraOn] = useState(false);
  const [softLight, setSoftLight] = useState(true);
  const [cameraMessage, setCameraMessage] = useState(
    'Start the camera for live expression control',
  );
  const [detectorState, setDetectorState] = useState<
    'idle' | 'loading' | 'calibrating' | 'ready' | 'paused' | 'fallback'
  >('idle');
  const [scores, setScores] = useState<Scores>(emptyScores);
  const [calibration, setCalibration] = useState(0);
  const [effectMode, setEffectModeState] = useState<EffectMode>('idle');
  const [burstId, setBurstId] = useState(0);
  const [headCollider, setHeadCollider] = useState<HeadCollider | null>(null);
  const [faceAnchors, setFaceAnchors] = useState<FaceAnchors | null>(null);
  const [headTilt, setHeadTilt] = useState(0);
  const [qualityMode, setQualityMode] = useState<QualityMode>('auto');
  const [qualityTier, setQualityTier] = useState<QualityTier>('mid');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [telemetry, setTelemetry] = useState<TelemetryEvent[]>([]);
  const [physicsMetrics, setPhysicsMetrics] = useState({
    activeParticles: 0,
    collisions: 0,
  });
  const [previewing, setPreviewing] = useState(false);
  const [showCollider, setShowCollider] = useState(false);
  const [performanceSummary, setPerformanceSummary] =
    useState<PerformanceSummary>(() =>
      summarizePerformance(createPerformanceBuffers(), 0),
    );

  const setEffectMode = useCallback((mode: EffectMode) => {
    effectModeRef.current = mode;
    setEffectModeState(mode);
  }, []);

  const logEvent = useCallback(
    (event: string, detail?: TelemetryEvent['detail']) => {
      setTelemetry((current) =>
        [
          ...current,
          { event, at: Math.round(performance.now()), detail },
        ].slice(-120),
      );
    },
    [],
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduceMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    qualityModeRef.current = qualityMode;
  }, [qualityMode]);

  useEffect(() => {
    qualityTierRef.current = qualityTier;
  }, [qualityTier]);

  useEffect(() => {
    const surfaces = Array.from(
      document.querySelectorAll<HTMLElement>('[data-glass]'),
    );
    const ambientActive = qualityTier === 'high' ? 0.24 : 0.16;
    const tiltStrength = qualityTier === 'high' ? 2.8 : 0;
    let animationFrame = 0;
    let lastPaint = 0;
    const states = new WeakMap<
      HTMLElement,
      {
        x: number;
        y: number;
        tx: number;
        ty: number;
        active: number;
        target: number;
      }
    >();
    surfaces.forEach((surface) =>
      states.set(surface, {
        x: 0.5,
        y: 0.5,
        tx: 0.5,
        ty: 0.5,
        active: ambientActive,
        target: ambientActive,
      }),
    );
    const move = (event: PointerEvent) => {
      document.documentElement.style.setProperty(
        '--page-mx',
        `${event.clientX}px`,
      );
      document.documentElement.style.setProperty(
        '--page-my',
        `${event.clientY}px`,
      );
      surfaces.forEach((surface) => {
        const rect = surface.getBoundingClientRect();
        const state = states.get(surface);
        if (!state) return;
        const near =
          event.clientX > rect.left - 86 &&
          event.clientX < rect.right + 86 &&
          event.clientY > rect.top - 86 &&
          event.clientY < rect.bottom + 86;
        state.target = near ? 1 : ambientActive;
        if (near) {
          state.tx = clamp01((event.clientX - rect.left) / rect.width);
          state.ty = clamp01((event.clientY - rect.top) / rect.height);
        }
      });
      if (!animationFrame && !document.hidden)
        animationFrame = requestAnimationFrame(render);
    };
    const render = (now: number) => {
      animationFrame = 0;
      if (document.hidden) return;
      if (now - lastPaint < 32) {
        animationFrame = requestAnimationFrame(render);
        return;
      }
      lastPaint = now;
      let unsettled = false;
      surfaces.forEach((surface) => {
        const state = states.get(surface);
        if (!state) return;
        const delta =
          Math.abs(state.tx - state.x) +
          Math.abs(state.ty - state.y) +
          Math.abs(state.target - state.active);
        if (delta < 0.002) return;
        unsettled = true;
        state.x += (state.tx - state.x) * 0.12;
        state.y += (state.ty - state.y) * 0.12;
        state.active += (state.target - state.active) * 0.14;
        const dx = state.x - 0.5;
        const dy = state.y - 0.5;
        surface.style.setProperty('--mx', `${state.x * 100}%`);
        surface.style.setProperty('--my', `${state.y * 100}%`);
        surface.style.setProperty(
          '--angle',
          `${Math.atan2(dy, dx) * (180 / Math.PI) + 90}deg`,
        );
        surface.style.setProperty('--active', state.active.toFixed(3));
        surface.style.setProperty('--rx', `${dx * tiltStrength}deg`);
        surface.style.setProperty('--ry', `${dy * -tiltStrength}deg`);
      });
      if (unsettled) animationFrame = requestAnimationFrame(render);
    };
    window.addEventListener('pointermove', move, { passive: true });
    animationFrame = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('pointermove', move);
    };
  }, [qualityTier]);

  const resetPerformance = useCallback(() => {
    performanceBuffersRef.current = createPerformanceBuffers();
    performanceStartedAtRef.current = performance.now();
    lastProcessedFrameAtRef.current = 0;
    pendingFeedbackRef.current = null;
    qualityRecommendationRef.current = { tier: null, windows: 0 };
    setPerformanceSummary(
      summarizePerformance(performanceBuffersRef.current, 0),
    );
  }, []);

  const releaseCamera = useCallback((clearView = true) => {
    cameraSessionRef.current?.abort();
    cameraSessionRef.current = null;
    cameraStartingRef.current = false;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    try {
      landmarkerRef.current?.close();
    } catch {
      // The detector may already be broken; still clear all owned state.
    }
    landmarkerRef.current = null;
    colliderRef.current = null;
    if (clearView) {
      setHeadCollider(null);
      setFaceAnchors(null);
      setHeadTilt(0);
    }
  }, []);

  const enterManualFallback = useCallback(
    (
      reason: CameraFailureReason | 'model_unavailable' | 'no_face_timeout' | 'inference_failed' | 'video_stalled' | 'track_ended',
      message: string,
      detail?: {
        domName?: string;
        phase?: CameraStartPhase;
        retryable?: boolean;
      },
    ) => {
      if (calibrationTimedOutRef.current) return;
      calibrationTimedOutRef.current = true;
      releaseCamera();
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
      candidateRef.current = { id: null, since: 0 };
      fireworksUntilRef.current = 0;
      setEffectMode('idle');
      setPreviewing(false);
      setPhysicsMetrics({ activeParticles: 0, collisions: 0 });
      setCameraOn(false);
      setDetectorState('fallback');
      setCameraMessage(message);
      logEvent('camera_fallback', {
        reason,
        manualPreviewAvailable: true,
        ...detail,
      });
    },
    [logEvent, releaseCamera, setEffectMode],
  );

  const initialiseDetector = useCallback(async (signal: AbortSignal) => {
    if (landmarkerRef.current) return true;
    setDetectorState('loading');
    setCameraMessage('Loading on-device face-action model…');
    try {
      const { FaceLandmarker, FilesetResolver } =
        await awaitOwnedResource(import('@mediapipe/tasks-vision'), { signal, timeoutMs: CAMERA_TIMEOUTS.model });
      const vision = await awaitOwnedResource(FilesetResolver.forVisionTasks('/wasm'), { signal, timeoutMs: CAMERA_TIMEOUTS.model });
      const ownDetector = (pending: Promise<FaceLandmarker>) => awaitOwnedResource(pending, {
        signal, timeoutMs: CAMERA_TIMEOUTS.model, dispose: detector => detector.close(),
      });
      let detector: FaceLandmarker;
      try {
        detector = await ownDetector(FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/face_landmarker.task',
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          minFaceDetectionConfidence: 0.58,
          minFacePresenceConfidence: 0.58,
          minTrackingConfidence: 0.54,
        }));
      } catch (error) {
        if (signal.aborted || (error instanceof Error && error.name === 'TimeoutError')) throw error;
        detector = await ownDetector(FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/face_landmarker.task',
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
        }));
      }
      if (signal.aborted) { detector.close(); return false; }
      landmarkerRef.current = detector;
      calibrationFramesRef.current = 0;
      calibrationStartedAtRef.current = performance.now();
      baselineRef.current = { ...emptyScores };
      setDetectorState('calibrating');
      setCameraMessage('Hold a relaxed neutral face · personal calibration');
      return true;
    } catch {
      if (signal.aborted) return false;
      enterManualFallback(
        'model_unavailable',
        'Face model unavailable · manual effect previews stay active',
        { phase: 'load_detector', retryable: true },
      );
      return false;
    }
  }, [enterManualFallback]);

  const commitEffect = useCallback(
    (
      mode: 'rain' | 'fireworks',
      source: 'face' | 'manual',
      detectedAt?: number,
    ) => {
      setEffectMode(mode);
      if (mode === 'fireworks') {
        setBurstId((current) => current + 1);
        fireworksUntilRef.current = performance.now() + 3200;
        lastFireworkAtRef.current = performance.now();
      } else {
        setPhysicsMetrics((current) => ({
          activeParticles: current.activeParticles,
          collisions: 0,
        }));
      }
      if (detectedAt !== undefined)
        pendingFeedbackRef.current = { action: mode, detectedAt };
      logEvent(`${mode}_triggered`, {
        source,
        collisionTarget: mode === 'fireworks' ? (source === 'manual' ? 'manual_demo_head' : 'live_head') : 'none',
      });
    },
    [logEvent, setEffectMode],
  );

  const analyseFrame = useCallback(() => {
    if (document.hidden) {
      frameRef.current = null;
      return;
    }
    const video = videoRef.current;
    const landmarker = landmarkerRef.current;
    const now = performance.now();
    if (video && video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current) {
      lastVideoProgressAtRef.current = now;
    }
    if (videoHasStalled(now, lastVideoProgressAtRef.current)) {
      enterManualFallback('video_stalled', 'Camera video stopped · retry camera or use manual previews');
      return;
    }
    if (!video || !landmarker || video.readyState < 2) {
      frameRef.current = requestAnimationFrame(analyseFrameRef.current);
      return;
    }
    if (calibrationStartedAtRef.current > 0 && shouldFallbackFromCalibration({
      startedAt: calibrationStartedAtRef.current, now,
      acceptedFrames: calibrationFramesRef.current, timedOut: calibrationTimedOutRef.current,
    })) {
      enterManualFallback('no_face_timeout', 'Calibration timed out · relax your face and retry camera');
      return;
    }
    const inferenceInterval =
      qualityTierRef.current === 'high'
        ? 66
        : qualityTierRef.current === 'mid'
          ? 85
          : 120;
    if (
      video.currentTime !== lastVideoTimeRef.current &&
      now - lastInferenceAtRef.current >= inferenceInterval
    ) {
      lastVideoTimeRef.current = video.currentTime;
      lastInferenceAtRef.current = now;
      if (lastProcessedFrameAtRef.current > 0)
        recordBoundedSample(
          performanceBuffersRef.current.videoFrameIntervalsMs,
          now - lastProcessedFrameAtRef.current,
        );
      lastProcessedFrameAtRef.current = now;
      const detectionStartedAt = performance.now();
      let result: ReturnType<FaceLandmarker['detectForVideo']>;
      try {
        result = landmarker.detectForVideo(video, now);
      } catch {
        setEffectMode('idle');
        candidateRef.current = { id: null, since: 0 };
        enterManualFallback('inference_failed', 'Face tracking stopped · retry camera or use manual previews');
        return;
      }
      recordBoundedSample(
        performanceBuffersRef.current.detectionDurationsMs,
        performance.now() - detectionStartedAt,
      );
      const categories = result.faceBlendshapes?.[0]?.categories ?? [];
      const landmarks = result.faceLandmarks?.[0] ?? [];
      if (categories.length > 0 && landmarks.length > 0) {
        lastFaceSeenRef.current = now;
        if (detectorState === 'paused') {
          setDetectorState('ready');
          setCameraMessage('Face returned · effects are live');
          logEvent('face_returned');
        }
        const byName = new Map(
          categories.map((item) => [item.categoryName, item.score]),
        );
        const smileShape =
          ((byName.get('mouthSmileLeft') ?? 0) +
            (byName.get('mouthSmileRight') ?? 0)) /
          2;
        const cheekSquint =
          ((byName.get('cheekSquintLeft') ?? 0) +
            (byName.get('cheekSquintRight') ?? 0)) /
          2;
        const jawOpen = byName.get('jawOpen') ?? 0;
        const blinkLeft = byName.get('eyeBlinkLeft') ?? 0;
        const blinkRight = byName.get('eyeBlinkRight') ?? 0;
        const reaction = scoreFaceReaction(smileShape, jawOpen, cheekSquint);
        const raw: Scores = {
          smile: reaction.smile,
          surprise: reaction.laugh,
          wink: clamp01(Math.abs(blinkLeft - blinkRight) * 1.38),
        };

        if (calibrationFramesRef.current < CALIBRATION_TARGET_FRAMES) {
          const assessment = assessNeutralFrame(raw);
          if (!assessment.accepted && assessment.reason) {
            calibrationRejectedRef.current[assessment.reason] += 1;
            setCameraMessage(calibrationPrompt(assessment.reason));
          } else {
            const count = calibrationFramesRef.current + 1;
            (Object.keys(raw) as Array<keyof Scores>).forEach((key) => {
              baselineRef.current[key] +=
                (raw[key] - baselineRef.current[key]) / count;
            });
            calibrationFramesRef.current = count;
            setCalibration(
              Math.round((count / CALIBRATION_TARGET_FRAMES) * 100),
            );
            if (count === CALIBRATION_TARGET_FRAMES) {
              setDetectorState('ready');
              setCameraMessage(
                isPremium
                  ? 'Face ready · Ghost Kiss will target your lips'
                  : 'Ready · smile for rain, laugh for fireworks',
              );
              logEvent('calibration_pass', {
                acceptedFrames: count,
                rejectedSmile: calibrationRejectedRef.current.smile_active,
                rejectedMouth: calibrationRejectedRef.current.mouth_active,
              });
            }
          }
        } else {
          const deltaSeconds = lastColliderAtRef.current
            ? (now - lastColliderAtRef.current) / 1000
            : 1 / 30;
          const collider = colliderFromLandmarks(
            landmarks,
            colliderRef.current,
            deltaSeconds,
            video,
          );
          lastColliderAtRef.current = now;
          colliderRef.current = collider;
          setHeadCollider(collider);
          if (video.videoWidth && video.clientWidth) {
            const project = (p: { x: number; y: number }) =>
              projectFacePoint(
                p,
                video.videoWidth,
                video.videoHeight,
                video.clientWidth,
                video.clientHeight,
              );
            const a = project(landmarks[13]);
            const b = project(landmarks[14]);
            setFaceAnchors({
              mouth: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
              crown: project(landmarks[10]),
              width: Math.abs(
                project(landmarks[234]).x - project(landmarks[454]).x,
              ),
            });
          }

          const roll = headRollDegrees(landmarks);
          if (roll !== null) setHeadTilt(normalizeHeadTilt(roll));

          const adjusted = { ...emptyScores };
          (Object.keys(raw) as Array<keyof Scores>).forEach((key) => {
            const baseline = baselineRef.current[key];
            adjusted[key] = adjustReactionScore(raw[key], baseline, key);
            smoothedRef.current[key] =
              smoothedRef.current[key] * 0.72 + adjusted[key] * 0.28;
          });
          const smoothed = { ...smoothedRef.current };
          setScores(smoothed);
          if (isPremium) {
            frameRef.current = requestAnimationFrame(analyseFrameRef.current);
            return;
          }
          const intent = resolveEffectIntent({
            smile: smoothed.smile,
            laugh: smoothed.surprise,
            wink: smoothed.wink,
          });

          if (intent === 'fireworks') {
            if (candidateRef.current.id !== 'fireworks')
              candidateRef.current = { id: 'fireworks', since: now };
            if (
              now - candidateRef.current.since >=
                (smoothed.wink >= 0.55
                  ? 120
                  : reactionThresholds.laughDwellMs) &&
              now - lastFireworkAtRef.current >=
                reactionThresholds.fireworkCooldownMs
            ) {
              commitEffect('fireworks', 'face', now);
              candidateRef.current = { id: null, since: 0 };
            }
          } else if (intent === 'rain') {
            if (candidateRef.current.id !== 'rain')
              candidateRef.current = { id: 'rain', since: now };
            if (
              now - candidateRef.current.since >=
                reactionThresholds.smileDwellMs &&
              now >= fireworksUntilRef.current &&
              effectModeRef.current !== 'rain'
            )
              commitEffect('rain', 'face', now);
          } else {
            candidateRef.current = { id: null, since: 0 };
            if (
              smoothed.smile < reactionThresholds.smileExit &&
              now >= fireworksUntilRef.current
            )
              setEffectMode('idle');
          }
          if (
            effectModeRef.current === 'fireworks' &&
            now >= fireworksUntilRef.current
          )
            setEffectMode(
              smoothed.smile >= reactionThresholds.smileEnter ? 'rain' : 'idle',
            );
        }
      } else {
        colliderRef.current = null;
        candidateRef.current = { id: null, since: 0 };
        setEffectMode('idle');
        setHeadCollider(null);
        setFaceAnchors(null);
        if (
          calibrationFramesRef.current < CALIBRATION_TARGET_FRAMES &&
          calibrationStartedAtRef.current > 0 &&
          shouldFallbackFromCalibration({
            startedAt: calibrationStartedAtRef.current,
            now,
            acceptedFrames: calibrationFramesRef.current,
            timedOut: calibrationTimedOutRef.current,
          })
        ) {
          enterManualFallback(
            'no_face_timeout',
            'No usable face found · manual previews stay active',
          );
          return;
        }
        if (
          lastFaceSeenRef.current > 0 &&
          now - lastFaceSeenRef.current > 900
        ) {
          setDetectorState('paused');
          setCameraMessage('Face lost · return to frame to resume');
        }
      }
    }
    if (!calibrationTimedOutRef.current)
      frameRef.current = requestAnimationFrame(analyseFrameRef.current);
  }, [
    commitEffect,
    detectorState,
    enterManualFallback,
    isPremium,
    logEvent,
    setEffectMode,
  ]);

  useEffect(() => {
    analyseFrameRef.current = analyseFrame;
  }, [analyseFrame]);

  useEffect(() => {
    const onVisibility = () => {
      document.documentElement.classList.toggle('demo-paused', document.hidden);
      streamRef.current?.getVideoTracks().forEach((track) => {
        track.enabled = !document.hidden;
      });
      if (document.hidden) {
        if (frameRef.current) cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      } else if (cameraOn && !frameRef.current) {
        // A deliberate background pause is not a foreground inference stall.
        lastProcessedFrameAtRef.current = 0;
        lastInferenceAtRef.current = performance.now();
        lastVideoProgressAtRef.current = performance.now();
        if (calibrationFramesRef.current < CALIBRATION_TARGET_FRAMES)
          calibrationStartedAtRef.current = performance.now();
        frameRef.current = requestAnimationFrame(analyseFrameRef.current);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [cameraOn]);

  useEffect(() => {
    const pending = pendingFeedbackRef.current;
    if (!pending || effectMode !== pending.action) return;
    const animationFrame = requestAnimationFrame(() => {
      const latency = performance.now() - pending.detectedAt;
      recordBoundedSample(
        performanceBuffersRef.current.nextPaintLatenciesMs,
        latency,
      );
      pendingFeedbackRef.current = null;
      logEvent('detection_to_raf_callback_latency', {
        action: pending.action,
        milliseconds: Number(latency.toFixed(1)),
        measurement: 'detection_to_next_animation_frame',
      });
    });
    return () => cancelAnimationFrame(animationFrame);
  }, [effectMode, burstId, logEvent]);

  useEffect(() => {
    if (!cameraOn || typeof PerformanceObserver === 'undefined' ||
        !PerformanceObserver.supportedEntryTypes.includes('longtask')) return;
    const observer = new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (entry.startTime >= performanceStartedAtRef.current && !document.hidden)
          performanceBuffersRef.current.longTaskCount += 1;
      }
    });
    try {
      observer.observe({ type: 'longtask', buffered: false });
      performanceBuffersRef.current.longTaskSupported = true;
    } catch { return; }
    return () => observer.disconnect();
  }, [cameraOn]);

  useEffect(() => {
    if (!cameraOn) return;
    const update = () => {
      const summary = summarizePerformance(
        performanceBuffersRef.current,
        performance.now() - performanceStartedAtRef.current,
      );
      setPerformanceSummary(summary);
      if (qualityModeRef.current !== 'auto') return;
      const recommended = recommendQualityTier(summary);
      if (!recommended) return;
      const previous = qualityRecommendationRef.current;
      const windows = previous.tier === recommended ? previous.windows + 1 : 1;
      qualityRecommendationRef.current = { tier: recommended, windows };
      if (
        !shouldApplyRecommendation(qualityTierRef.current, recommended, windows)
      )
        return;
      qualityTierRef.current = recommended;
      setQualityTier(recommended);
      logEvent('quality_tier_changed', {
        tier: recommended,
        source: 'local_runtime_sample',
      });
    };
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [cameraOn, logEvent]);

  useEffect(
    () => () => {
      releaseCamera(false);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    },
    [releaseCamera],
  );

  async function startCamera() {
    if (cameraStartingRef.current) return;
    releaseCamera();
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setPreviewing(false);
    const session = new AbortController();
    cameraSessionRef.current = session;
    const isCurrent = () => !session.signal.aborted && cameraSessionRef.current === session;
    cameraStartingRef.current = true;
    setCameraOn(false);
    setDetectorState('loading');
    setCameraMessage('Allow camera access in your browser');
    resetPerformance();
    calibrationTimedOutRef.current = false;
    calibrationFramesRef.current = 0;
    calibrationStartedAtRef.current = 0;
    calibrationRejectedRef.current = { ...emptyCalibrationRejections };
    baselineRef.current = { ...emptyScores };
    smoothedRef.current = { ...emptyScores };
    candidateRef.current = { id: null, since: 0 };
    setCalibration(0);
    setScores({ ...emptyScores });
    setEffectMode('idle');
    let phase: CameraStartPhase = 'request_media';
    try {
      if (!window.isSecureContext) {
        const error = new Error('Camera requires a secure context');
        error.name = 'SecurityError';
        throw error;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        const error = new Error('Camera API is unavailable');
        error.name = 'NotFoundError';
        throw error;
      }
      const stream = await awaitOwnedResource(navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      }), { signal: session.signal, timeoutMs: CAMERA_TIMEOUTS.request, dispose: value => value.getTracks().forEach(track => track.stop()) });
      if (!isCurrent()) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
        if (isCurrent()) enterManualFallback('track_ended', 'Camera disconnected · reconnect or use manual previews');
      }, { once: true, signal: session.signal }));
      phase = 'start_video';
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await awaitOwnedResource(videoRef.current.play(), { signal: session.signal, timeoutMs: CAMERA_TIMEOUTS.video });
      }
      if (!isCurrent()) return;
      setCameraOn(true);
      lastFaceSeenRef.current = performance.now();
      phase = 'load_detector';
      const ready = await initialiseDetector(session.signal);
      lastVideoTimeRef.current = -1;
      lastVideoProgressAtRef.current = performance.now();
      if (ready && isCurrent())
        frameRef.current = requestAnimationFrame(analyseFrameRef.current);
    } catch (error) {
      if (!isCurrent()) return;
      const failure = classifyCameraStartError(error, phase);
      enterManualFallback(failure.reason, failure.userMessage, {
        domName: failure.domName,
        phase: failure.phase,
        retryable: failure.retryable,
      });
    } finally {
      if (isCurrent()) cameraStartingRef.current = false;
    }
  }

  function stopCamera() {
    releaseCamera();
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    setPreviewing(false);
    setFaceAnchors(null);
    calibrationTimedOutRef.current = false;
    setCameraOn(false);
    setDetectorState('idle');
    setCameraMessage(
      isPremium
        ? 'Camera stopped · preview face stays available'
        : 'Camera stopped · manual previews stay active',
    );
    setEffectMode('idle');
    logEvent('camera_stopped');
  }

  function previewEffect(mode: 'rain' | 'fireworks') {
    setPreviewing(true);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    commitEffect(mode, 'manual');
    previewTimerRef.current = setTimeout(
      () => setEffectMode('idle'),
      mode === 'fireworks' ? 3900 : 3000,
    );
  }

  function resetEffects() {
    setPreviewing(false);
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
    candidateRef.current = { id: null, since: 0 };
    fireworksUntilRef.current = 0;
    setEffectMode('idle');
    setPhysicsMetrics({ activeParticles: 0, collisions: 0 });
    logEvent('effects_reset');
  }

  function selectQualityMode(mode: QualityMode) {
    setQualityMode(mode);
    qualityModeRef.current = mode;
    if (mode !== 'auto') {
      setQualityTier(mode);
      qualityTierRef.current = mode;
    }
  }

  function exportTelemetry() {
    const body = JSON.stringify(
      {
        version: DEMO_VERSION,
        exportedAt: new Date().toISOString(),
        promptMapping: {
          smile: 'rain',
          bigLaugh: 'fireworks',
          fireworkPhysics: 'dynamic mirrored face-oval ellipse collider',
        },
        runtime: {
          qualityMode,
          qualityTier,
          effectMode,
          headCollider,
          headTilt,
          physics: physicsMetrics,
        },
        performance: summarizePerformance(
          performanceBuffersRef.current,
          performanceStartedAtRef.current
            ? performance.now() - performanceStartedAtRef.current
            : 0,
        ),
        evidenceBoundary:
          'This export covers one local run. It is not a cross-creator accuracy claim.',
        events: telemetry,
      },
      null,
      2,
    );
    const url = URL.createObjectURL(
      new Blob([body], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'rain-fireworks-camera-test.json';
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const effectiveCollider =
    headCollider ?? (previewing && !cameraOn && effectMode !== 'idle' ? manualCollider : null);
  const stageLabel =
    detectorState === 'calibrating'
      ? `Calibrating ${calibration}%`
      : effectMode === 'rain'
        ? 'Smile · Rain'
        : effectMode === 'fireworks'
          ? 'Big laugh · Fireworks'
          : detectorState === 'ready'
            ? 'Ready'
            : 'Preview ready';
  if (isPremium)
    return (
      <GhostStudio
        videoRef={videoRef}
        cameraOn={cameraOn}
        cameraMessage={cameraMessage}
        detectorState={detectorState}
        onOpenCamera={startCamera}
        onStopCamera={stopCamera}
        anchors={faceAnchors}
        reduceMotion={reduceMotion}
      />
    );

  return (
    <WeatherStudio
      videoRef={videoRef} cameraOn={cameraOn} cameraMessage={cameraMessage}
      detectorState={detectorState} mode={effectMode} previewing={previewing}
      stageLabel={stageLabel} softLight={softLight} onSoftLight={setSoftLight}
      reducedMotion={reduceMotion} lowPower={qualityTier === 'low'}
      onOpenCamera={startCamera} onStopCamera={stopCamera}
      onPreview={previewEffect} onReset={resetEffects}
      diagnostics={<>
        <SignalBar label="Smile → rain" value={scores.smile} threshold={reactionThresholds.smileEnter} color="#25f4ee" />
        <SignalBar label="Laugh → fireworks" value={scores.surprise} threshold={reactionThresholds.laughEnter} color="#fe2c55" />
        <p>Quality · {qualityTier.toUpperCase()} · {DEMO_VERSION}</p>
        <div className="ws-quality-options">{(['auto', 'high', 'mid', 'low'] as QualityMode[]).map(mode => <button key={mode} aria-pressed={qualityMode === mode} onClick={() => selectQualityMode(mode)}>{mode}</button>)}</div>
        <div className="ws-metrics">
          <span>Inference Hz {performanceSummary.inferenceFps ?? '—'}</span>
          <span>Effect FPS {performanceSummary.renderFps ?? '—'}</span>
          <span>Detect p95 {performanceSummary.detectionP95Ms ?? '—'} ms</span>
          <span>Frame p95 {performanceSummary.renderFrameP95Ms ?? '—'} ms</span>
          <span>Long tasks {performanceSummary.longTaskCount ?? 'Unavailable'}</span>
          <span>Particles {physicsMetrics.activeParticles}</span>
          <span>Collisions {physicsMetrics.collisions}</span>
        </div>
        <p>Measurements cover this local run. Manual previews use a simulated head. Real-camera validation is recorded separately.</p>
        <label style={{display:'block',marginBottom:12}}><input type="checkbox" checked={showCollider} onChange={event => setShowCollider(event.target.checked)} /> Show head collision boundary</label>
        <button onClick={exportTelemetry} disabled={telemetry.length === 0}><Download size={14} style={{display:'inline', marginRight:6}} /> Export test log</button>
      </>}
    >
      {effectMode !== 'idle' && <PromptEffectsCanvas
        mode={effectMode} burstId={burstId} smilePower={scores.smile}
        laughPower={scores.surprise} collider={effectiveCollider}
        quality={qualityTier} reduceMotion={reduceMotion} onMetrics={setPhysicsMetrics}
        showCollider={showCollider}
        onRenderFrame={interval => recordBoundedSample(performanceBuffersRef.current.renderFrameIntervalsMs, interval)}
      />}
    </WeatherStudio>
  );
}

export default function Home() {
  return <ReactionWeatherDemo experience="standard" />;
}
