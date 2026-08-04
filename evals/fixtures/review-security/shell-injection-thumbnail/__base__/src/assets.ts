import { type AssetProbe, probeAsset } from './media.js';

export interface Session {
  userId: string;
}

export interface Request {
  params: Record<string, string>;
  query: Record<string, string>;
  session: Session | null;
}

export interface Asset {
  id: string;
  ownerId: string;
  storagePath: string;
}

export interface AssetStore {
  find(id: string, ownerId: string): Promise<Asset | null>;
}

/** GET /assets/:id — intrinsic dimensions of one of the caller's assets. */
export async function getAssetMeta(
  req: Request,
  store: AssetStore,
): Promise<AssetProbe> {
  if (req.session === null) {
    throw new Error('unauthenticated');
  }
  const asset = await store.find(req.params.id, req.session.userId);
  if (asset === null) {
    throw new Error('not found');
  }
  return probeAsset(asset.storagePath);
}
