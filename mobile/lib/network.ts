export interface FetchWithRetryOptions {
  fetchImpl?: typeof fetch
  retries?: number
  timeoutMs?: number
  delay?: (attempt: number) => Promise<void>
}

function retryableMethod(method: string): boolean {
  return method === 'GET' || method === 'HEAD'
}

function wait(attempt: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.min(2_000, 250 * 2 ** attempt)));
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const method = String(init.method ?? 'GET').toUpperCase();
  const retries = retryableMethod(method) ? Math.max(0, options.retries ?? 2) : 0;
  const delay = options.delay ?? wait;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await fetchImpl(input, {
        ...init,
        signal: init.signal ?? controller.signal,
      });
      if (response.status >= 500 && attempt < retries) {
        await delay(attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.name === 'AbortError' && init.signal?.aborted) throw error;
      if (attempt >= retries) throw error;
      await delay(attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('网络请求失败');
}
