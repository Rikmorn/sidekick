export interface Request {
  headers: Record<string, string>;
}

/** The bearer token, or null when the header is absent or malformed. */
export function bearerToken(req: Request): string | null {
  const raw = req.headers.authorization ?? req.headers.Authorization;
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === '' || !trimmed.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = trimmed.slice('bearer '.length).trim();
  return token === '' ? null : token;
}

/** The API key, or null when the header is absent or blank. */
export function apiKey(req: Request): string | null {
  const raw = req.headers['x-api-key'] ?? req.headers['X-Api-Key'];
  if (raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}
