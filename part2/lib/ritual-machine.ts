export type RitualResult = 'treat' | 'trick' | 'secret';

export type RitualStage =
  | 'idle'
  | 'arrived'
  | 'sculpting'
  | 'paused'
  | 'reveal'
  | 'peak'
  | 'afterglow'
  | 'cooldown';

export type RitualState = {
  stage: RitualStage;
  sender: string | null;
  progress: number;
  result: RitualResult | null;
  signed: boolean;
  runId: number;
};

export type RitualAction =
  | { type: 'RECEIVE'; sender: string }
  | { type: 'BEGIN' }
  | { type: 'TICK'; smile: number; deltaMs: number }
  | { type: 'CONFIRM'; result: RitualResult }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'SIGN' }
  | { type: 'ENTER'; stage: 'peak' | 'afterglow' | 'cooldown' }
  | { type: 'RESET' };

export const initialRitualState: RitualState = {
  stage: 'idle',
  sender: null,
  progress: 0,
  result: null,
  signed: false,
  runId: 0,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

const legalStageAdvance: Partial<Record<RitualStage, RitualStage>> = {
  reveal: 'peak',
  peak: 'afterglow',
  afterglow: 'cooldown',
};

export function ritualReducer(state: RitualState, action: RitualAction): RitualState {
  switch (action.type) {
    case 'RECEIVE':
      if (state.stage !== 'idle') return state;
      return { ...initialRitualState, stage: 'arrived', sender: action.sender, runId: state.runId + 1 };
    case 'BEGIN':
      return state.stage === 'arrived' ? { ...state, stage: 'sculpting' } : state;
    case 'TICK': {
      if (state.stage !== 'sculpting') return state;
      const charging = action.smile >= 0.28;
      const change = charging ? (action.deltaMs / 1850) * (0.48 + action.smile * 0.82) : -(action.deltaMs / 4200);
      const progress = clamp01(state.progress + change);
      if (progress >= 0.999) return { ...state, progress: 1, result: 'treat', stage: 'reveal' };
      return { ...state, progress };
    }
    case 'CONFIRM': {
      if (state.stage !== 'sculpting' && state.stage !== 'paused') return state;
      const result = action.result === 'trick' && state.progress > 0.55 ? 'secret' : action.result;
      return { ...state, result, stage: 'reveal', progress: Math.max(state.progress, 0.36) };
    }
    case 'PAUSE':
      return state.stage === 'sculpting' ? { ...state, stage: 'paused' } : state;
    case 'RESUME':
      return state.stage === 'paused' ? { ...state, stage: 'sculpting' } : state;
    case 'SIGN':
      return state.stage === 'afterglow' ? { ...state, signed: true } : state;
    case 'ENTER':
      return legalStageAdvance[state.stage] === action.stage
        ? { ...state, stage: action.stage }
        : state;
    case 'RESET':
      return { ...initialRitualState, runId: state.runId };
    default:
      return state;
  }
}

export function getRitualInstruction(state: RitualState) {
  switch (state.stage) {
    case 'idle': return 'Waiting for a viewer Gift';
    case 'arrived': return `Mystery Capsule received from ${state.sender}`;
    case 'sculpting': return state.progress > 0.55
      ? 'Keep smiling for Treat · open your mouth now for the secret ending'
      : 'Hold a smile for Treat · open your mouth for Trick';
    case 'paused': return 'Ritual paused · return to frame or choose manually';
    case 'reveal': return 'Your reaction chose the ending';
    case 'peak': return state.result === 'secret' ? 'Rare Moon Rift awakened' : `${state.result === 'treat' ? 'Treat' : 'Trick'} revealed`;
    case 'afterglow': return state.signed ? 'Creator signature captured' : 'Wink to sign the Gift';
    case 'cooldown': return 'Saving this moment to the room memory';
  }
}
