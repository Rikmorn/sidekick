export interface FetchResult {
  ok: boolean;
  status: number;
  body: string;
}

export async function fetchOnce(url: string): Promise<FetchResult> {
  const res = await fetch(url);
  return { ok: res.ok, status: res.status, body: await res.text() };
}

/** Retry transient failures up to `attempts` times before giving up. */
export async function fetchWithRetry(
  url: string,
  attempts = 3,
): Promise<FetchResult> {
  let last: FetchResult | null = null;
  for (let i = 0; i < attempts; i++) {
    last = await fetchOnce(url);
    if (last.ok) {
      continue;
    }
    return last;
  }
  return last as FetchResult;
}
