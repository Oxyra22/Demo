import type { RitualResult } from './ritual-machine';

export type ThreeFallbackReason =
  | 'webgl_unavailable'
  | 'model_load_failed'
  | 'context_lost'
  | 'render_failed'
  | 'quality_low_policy';

export type ThreeSceneEvent =
  | {
      type: 'scene_started';
      sceneRunId: string;
      elapsedMs: number;
      loadedModels: number;
    }
  | {
      type: 'models_loaded';
      sceneRunId: string;
      elapsedMs: number;
      loadedModels: number;
    }
  | {
      type: 'first_visible_frame';
      sceneRunId: string;
      result: RitualResult;
      elapsedMs: number;
      revealToFrameMs: number;
      loadedModels: number;
    }
  | {
      type: 'fallback';
      sceneRunId: string;
      reason: ThreeFallbackReason;
      phase: 'policy' | 'initializing' | 'loading' | 'rendering';
      elapsedMs: number;
      loadedModels: number;
    };

export type ThreeEvidenceState = {
  sceneRunId: string | null;
  status:
    | 'not_started'
    | 'loading'
    | 'models_loaded'
    | 'first_visible_frame'
    | 'fallback';
  loadedModels: number;
  modelsLoadedMs?: number;
  firstVisibleFrameMs?: number;
  revealToFrameMs?: number;
  result?: RitualResult;
  fallbackReason?: ThreeFallbackReason;
  fallbackPhase?: 'policy' | 'initializing' | 'loading' | 'rendering';
};

export const initialThreeEvidence: ThreeEvidenceState = {
  sceneRunId: null,
  status: 'not_started',
  loadedModels: 0,
};

export function mergeThreeEvidence(
  state: ThreeEvidenceState,
  event: ThreeSceneEvent,
): ThreeEvidenceState {
  if (event.type === 'scene_started') {
    return {
      sceneRunId: event.sceneRunId,
      status: 'loading',
      loadedModels: event.loadedModels,
    };
  }
  if (state.sceneRunId !== event.sceneRunId || state.status === 'fallback')
    return state;
  if (event.type === 'models_loaded') {
    if (state.status === 'first_visible_frame') return state;
    return {
      ...state,
      status: 'models_loaded',
      loadedModels: event.loadedModels,
      modelsLoadedMs: event.elapsedMs,
    };
  }
  if (event.type === 'first_visible_frame') {
    if (
      state.modelsLoadedMs === undefined ||
      state.status === 'first_visible_frame'
    )
      return state;
    return {
      ...state,
      status: 'first_visible_frame',
      loadedModels: event.loadedModels,
      firstVisibleFrameMs: event.elapsedMs,
      revealToFrameMs: event.revealToFrameMs,
      result: event.result,
    };
  }
  return {
    ...state,
    status: 'fallback',
    loadedModels: event.loadedModels,
    fallbackReason: event.reason,
    fallbackPhase: event.phase,
  };
}
