export type CameraStartPhase =
  | 'request_media'
  | 'start_video'
  | 'load_detector';

export type CameraFailureReason =
  | 'permission_denied'
  | 'device_not_found'
  | 'device_unreadable'
  | 'request_aborted'
  | 'startup_timeout'
  | 'security_blocked'
  | 'unknown';

export type CameraFailure = {
  reason: CameraFailureReason;
  domName: string;
  phase: CameraStartPhase;
  retryable: boolean;
  userMessage: string;
};

const failureCopy: Record<
  CameraFailureReason,
  Pick<CameraFailure, 'retryable' | 'userMessage'>
> = {
  permission_denied: {
    retryable: false,
    userMessage:
      'Camera access was not allowed · enable permission or continue manually',
  },
  device_not_found: {
    retryable: true,
    userMessage: 'No camera found · connect a camera or continue manually',
  },
  device_unreadable: {
    retryable: true,
    userMessage:
      'Camera is unavailable or in use · close other apps and try again',
  },
  request_aborted: {
    retryable: true,
    userMessage: 'Camera start was interrupted · try again or continue manually',
  },
  startup_timeout: {
    retryable: true,
    userMessage: 'Camera start timed out · retry camera or use manual previews',
  },
  security_blocked: {
    retryable: false,
    userMessage:
      'This browser context blocks camera access · continue with manual controls',
  },
  unknown: {
    retryable: true,
    userMessage: 'Camera is temporarily unavailable · try again or continue manually',
  },
};

export function classifyCameraStartError(
  error: unknown,
  phase: CameraStartPhase,
): CameraFailure {
  const domName =
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string'
      ? error.name
      : 'UnknownError';
  const reason: CameraFailureReason =
    domName === 'NotAllowedError'
      ? 'permission_denied'
      : domName === 'NotFoundError'
        ? 'device_not_found'
        : domName === 'NotReadableError'
          ? 'device_unreadable'
          : domName === 'AbortError'
            ? 'request_aborted'
            : domName === 'TimeoutError'
              ? 'startup_timeout'
            : domName === 'SecurityError'
              ? 'security_blocked'
              : 'unknown';
  return { reason, domName, phase, ...failureCopy[reason] };
}
