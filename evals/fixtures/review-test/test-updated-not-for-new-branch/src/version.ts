export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** Absent for a stable release; "beta.1" for `1.2.3-beta.1`. */
  prerelease?: string;
}

/**
 * Parse a `major.minor.patch` string, optionally carrying a prerelease
 * suffix; null when it does not match.
 */
export function parseVersion(raw: string): Version | null {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(raw.trim());
  if (m === null) {
    return null;
  }
  const version: Version = {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
  };
  return m[4] === undefined ? version : { ...version, prerelease: m[4] };
}
