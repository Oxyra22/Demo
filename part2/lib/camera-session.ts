/** A resource belongs to one camera session. Late results are always disposed. */
export function awaitOwnedResource<T>(
  pending: Promise<T>,
  options: { signal: AbortSignal; timeoutMs: number; dispose?: (value: T) => void },
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const dispose = (value: T) => {
      try { options.dispose?.(value); } catch { /* Release remaining session state. */ }
    };
    const cleanup = () => {
      clearTimeout(timer);
      options.signal.removeEventListener('abort', onAbort);
    };
    const fail = (name: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      const error = new Error(name === 'TimeoutError' ? 'Camera stage timed out' : 'Camera session cancelled');
      error.name = name;
      reject(error);
    };
    const onAbort = () => fail('AbortError');
    pending.then(value => {
      if (settled || options.signal.aborted) { dispose(value); onAbort(); return; }
      settled = true;
      cleanup();
      resolve(value);
    }, error => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });
    if (options.signal.aborted) onAbort();
    else {
      options.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => fail('TimeoutError'), options.timeoutMs);
    }
  });
}

export const CAMERA_TIMEOUTS = { request: 15000, video: 8000, model: 20000, frame: 5000 } as const;

export function videoHasStalled(now: number, lastProgressAt: number) {
  return lastProgressAt > 0 && now - lastProgressAt > CAMERA_TIMEOUTS.frame;
}
