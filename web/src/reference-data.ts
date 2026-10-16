// Cache successful decodes in memory; concurrent first uses share a request.
// Failed requests are retryable and never replace a successfully decoded value.
export function referenceData<T>(url: string, decode: (value: unknown) => T): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => {
    pending ??= fetch(url, { credentials: 'same-origin', cache: 'force-cache', signal: AbortSignal.timeout(15000) })
      .then(async (response) => {
        if (!response.ok) throw new Error('Reference data unavailable');
        return decode(await response.json());
      })
      .catch((error) => {
        pending = undefined;
        throw error;
      });
    return pending;
  };
}
