export interface FetchResult {
  ok: boolean;
  status: number;
  body: string;
}

export async function fetchOnce(url: string): Promise<FetchResult> {
  const res = await fetch(url);
  return { ok: res.ok, status: res.status, body: await res.text() };
}
