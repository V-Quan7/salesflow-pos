export type ScannerLifecycleHandle<Listener> = {
  offProcessed: (listener: Listener) => void;
  stop: () => unknown;
};

export function cleanupBarcodeScanner<Listener>(
  scanner: ScannerLifecycleHandle<Listener> | null,
  listener: Listener,
  listenerAttached: boolean,
): void {
  if (!scanner) return;
  if (listenerAttached) {
    try { scanner.offProcessed(listener); } catch { /* Continue to stop the camera even if listener removal fails. */ }
  }
  try {
    void Promise.resolve(scanner.stop()).catch(() => undefined);
  } catch {
    // A synchronous stop failure must not prevent the listener from being detached.
  }
}
