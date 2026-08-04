export interface Request {
  headers: Record<string, string>;
}

/**
 * First present header among `names`, trimmed; null when none is present or
 * the present one is blank. Extracted from the duplicated lookup below.
 */
function firstHeader(req: Request, names: string[]): string | null {
  for (const name of names) {
    const raw = req.headers[name];
    if (raw !== undefined) {
      const trimmed = raw.trim();
      return trimmed === '' ? null : trimmed;
    }
  }
  return null;
}

/** The bearer token, or null when the header is absent or malformed. */
export function bearerToken(req: Request): string | null {
  const value = firstHeader(req, ['authorization', 'Authorization']);
  if (value === null || !value.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = value.slice('bearer '.length).trim();
  return token === '' ? null : token;
}

/** The API key, or null when the header is absent or blank. */
export function apiKey(req: Request): string | null {
  return firstHeader(req, ['x-api-key', 'X-Api-Key']);
}
