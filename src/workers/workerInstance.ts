let _worker: Worker | null = null

export function getPipelineWorker(): Worker {
  if (_worker) return _worker
  try {
    _worker = new Worker(new URL('./pipelineWorker.ts', import.meta.url), { type: 'module' })
  } catch {
    // Fallback for environments without Worker support (e.g. test runners).
    // Hooks still run; they just never receive worker responses (tests set state directly).
    _worker = {
      postMessage: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      terminate: () => {},
      onmessage: null,
      onmessageerror: null,
      onerror: null,
      dispatchEvent: () => false,
    } as unknown as Worker
  }
  return _worker
}
