import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

export const MEDIA_TMP = process.env.MEDIA_TMP ?? '/tmp/media';

export interface AssetProbe {
  width: number;
  height: number;
}

/** Read intrinsic dimensions with ImageMagick's `identify`. */
export function probeAsset(assetPath: string): AssetProbe {
  const out = execFileSync('identify', ['-format', '%w %h', assetPath], {
    encoding: 'utf-8',
  });
  const [width, height] = out.trim().split(' ').map(Number);
  return { width, height };
}

export function tmpPathFor(name: string): string {
  return path.join(MEDIA_TMP, name);
}
