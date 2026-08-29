export interface GalleryAsset {
  id: string;
  type: string;
  jobId: string | null;
  createdAt: Date;
}

export interface AssetGroup {
  /** Stable key: the job for a generated set, the asset id for an upload. */
  key: string;
  assets: GalleryAsset[];
}

export const GALLERY_FILTERS = ["all", "image", "video", "audio", "model3d"] as const;
export type GalleryFilter = (typeof GALLERY_FILTERS)[number];

export function parseGalleryFilter(value: string | undefined): GalleryFilter {
  return GALLERY_FILTERS.includes(value as GalleryFilter)
    ? (value as GalleryFilter)
    : "all";
}

/**
 * Groups assets that were generated together into one set.
 *
 * A batch image job returns up to fifteen images at once. Flat, they bury
 * everything else in the library and read as fifteen unrelated results rather
 * than one answer to one prompt.
 *
 * Uploads have no job, so each stands alone — grouping them by a null jobId
 * would collapse a user's entire upload history into a single set.
 *
 * Input order is preserved, so the caller's ordering (newest first) decides
 * both the order of the sets and the order within them.
 */
export function groupAssets(assets: readonly GalleryAsset[]): AssetGroup[] {
  const groups: AssetGroup[] = [];
  const byJob = new Map<string, AssetGroup>();

  for (const asset of assets) {
    if (asset.jobId === null) {
      groups.push({ key: asset.id, assets: [asset] });
      continue;
    }

    const existing = byJob.get(asset.jobId);
    if (existing === undefined) {
      const group: AssetGroup = { key: asset.jobId, assets: [asset] };
      byJob.set(asset.jobId, group);
      groups.push(group);
      continue;
    }
    existing.assets.push(asset);
  }

  return groups;
}

export type GalleryRow =
  | { kind: "grid"; key: string; assets: GalleryAsset[] }
  | { kind: "set"; key: string; assets: GalleryAsset[] };

/**
 * Lays groups out as alternating runs.
 *
 * Consecutive single assets share one grid so the page keeps an even rhythm;
 * a set breaks the run and takes its own full-width block. Giving every single
 * asset its own grid would put one tile on each row, and letting a set flow
 * inline would hide the fact that its members belong together.
 */
export function toGalleryRows(groups: readonly AssetGroup[]): GalleryRow[] {
  const rows: GalleryRow[] = [];
  let run: GalleryAsset[] = [];

  const flush = () => {
    if (run.length === 0) return;
    rows.push({ kind: "grid", key: `grid-${run[0]!.id}`, assets: run });
    run = [];
  };

  for (const group of groups) {
    if (group.assets.length > 1) {
      flush();
      rows.push({ kind: "set", key: group.key, assets: group.assets });
      continue;
    }
    run.push(group.assets[0]!);
  }
  flush();

  return rows;
}
