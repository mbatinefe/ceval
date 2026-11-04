export async function retryCapturedRequest<T>(
  send: (requestId: string) => Promise<T>,
  signal: AbortSignal,
  retry: (error: unknown) => { at: number } | null,
): Promise<T> {
  const requestId = crypto.randomUUID();
  const deadline = Date.now() + 180000;
  const wait = (at: number) =>
    new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(
        () => {
          signal.removeEventListener("abort", abort);
          resolve();
        },
        Math.max(0, at - Date.now()),
      );
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  const sendPending = async (): Promise<T> => {
    for (;;) {
      signal.throwIfAborted();
      try {
        return await send(requestId);
      } catch (error) {
        if (
          !error ||
          typeof error !== "object" ||
          !("code" in error) ||
          error.code !== "analysis_pending" ||
          Date.now() + 5000 >= deadline
        )
          throw error;
        await wait(Date.now() + 5000);
      }
    }
  };
  signal.throwIfAborted();
  try {
    return await sendPending();
  } catch (error) {
    signal.throwIfAborted();
    const next = retry(error);
    if (!next) throw error;
    await wait(next.at);
    signal.throwIfAborted();
    return sendPending();
  }
}
