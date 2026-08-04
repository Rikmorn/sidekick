export interface Version {
  major: number;
  minor: number;
  patch: number;
}

/** Parse a `major.minor.patch` string; null when it does not match. */
export function parseVersion(raw: string): Version | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(raw.trim());
  if (m === null) {
    return null;
  }
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}
