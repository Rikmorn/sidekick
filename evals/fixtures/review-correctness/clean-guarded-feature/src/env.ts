export function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === '' ? undefined : value;
}

export type PortResult =
  | { ok: true; port: number }
  | { ok: false; reason: string };

/** Parse a TCP port from the environment, defaulting when unset. */
export function readPort(name: string, fallback: number): PortResult {
  const raw = readEnv(name);
  if (raw === undefined) {
    return { ok: true, port: fallback };
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, reason: `${name} must be an integer in [1, 65535]` };
  }
  return { ok: true, port };
}
