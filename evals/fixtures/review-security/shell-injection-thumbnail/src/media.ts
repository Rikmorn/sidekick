import { execFileSync, execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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

/**
 * Render a resized copy of an asset. `size` is an ImageMagick geometry string
 * such as "320x240" or "50%".
 */
export function renderThumbnail(assetPath: string, size: string): string {
  const dest = tmpPathFor(`${randomUUID()}.png`);
  execSync(`convert ${assetPath} -resize ${size} ${dest}`);
  return dest;
}
