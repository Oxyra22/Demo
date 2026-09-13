export type PerformanceBuffers = {
  renderFrameIntervalsMs: number[];
  videoFrameIntervalsMs: number[];
  detectionDurationsMs: number[];
  nextPaintLatenciesMs: number[];
  longTaskCount: number;
  longTaskSupported: boolean;
};

export type PerformanceSummary = {
  renderFps?: number | null;
  renderFrameP95Ms?: number | null;
  sampleDurationMs: number;
  processedFrames: number;
  inferenceFps: number | null;
  inferenceLateRate: number | null;
  detectionP50Ms: number | null;
  detectionP95Ms: number | null;
  nextPaintP95Ms: number | null;
  feedbackSamples: number;
  longTaskCount: number | null;
};

export const PERFORMANCE_BUFFER_LIMIT = 600;
// Samples are deliberately throttled inference intervals, NOT display frames.
export const INFERENCE_LATE_LIMIT_MS = 180;

export function createPerformanceBuffers(): PerformanceBuffers {
  return {
    renderFrameIntervalsMs: [],
    videoFrameIntervalsMs: [],
    detectionDurationsMs: [],
    nextPaintLatenciesMs: [],
    longTaskCount: 0,
    longTaskSupported: false,
  };
}

export function recordBoundedSample(samples: number[], value: number, limit = PERFORMANCE_BUFFER_LIMIT) {
  if (!Number.isFinite(value) || value < 0 || limit <= 0) return;
  samples.push(value);
  if (samples.length > limit) samples.splice(0, samples.length - limit);
}

export function percentile(samples: number[], ratio: number): number | null {
  if (samples.length === 0) return null;
  const sorted = samples.filter(Number.isFinite).toSorted((a, b) => a - b);
  if (sorted.length === 0) return null;
  const bounded = Math.max(0, Math.min(1, ratio));
  const index = Math.ceil(bounded * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

function round(value: number | null, precision = 1) {
  if (value === null) return null;
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

export function summarizePerformance(buffers: PerformanceBuffers, sampleDurationMs: number): PerformanceSummary {
  // Keep long foreground stalls: dropping >= 1s samples would hide failures.
  const validIntervals = buffers.videoFrameIntervalsMs.filter((value) => Number.isFinite(value) && value > 0);
  const medianInterval = percentile(validIntervals, 0.5);
  const slowFrames = validIntervals.filter((value) => value > INFERENCE_LATE_LIMIT_MS).length;
  return {
    renderFps: buffers.renderFrameIntervalsMs.length ? round(1000 / (percentile(buffers.renderFrameIntervalsMs, .5) || 1)) : null,
    renderFrameP95Ms: round(percentile(buffers.renderFrameIntervalsMs, .95)),
    sampleDurationMs: Math.max(0, Math.round(sampleDurationMs)),
    processedFrames: buffers.detectionDurationsMs.length,
    inferenceFps: medianInterval ? round(1000 / medianInterval) : null,
    inferenceLateRate: validIntervals.length ? round(slowFrames / validIntervals.length, 3) : null,
    detectionP50Ms: round(percentile(buffers.detectionDurationsMs, 0.5)),
    detectionP95Ms: round(percentile(buffers.detectionDurationsMs, 0.95)),
    nextPaintP95Ms: round(percentile(buffers.nextPaintLatenciesMs, 0.95)),
    feedbackSamples: buffers.nextPaintLatenciesMs.length,
    longTaskCount: buffers.longTaskSupported ? buffers.longTaskCount : null,
  };
}
