import Link from "next/link";

import { MeshViewer } from "./mesh-viewer";
import { PublishToggle } from "./publish-toggle";

const TYPE_LABELS: Record<string, string> = {
  image: "Image",
  video: "Video",
  audio: "Voice",
  model3d: "3D",
};

/**
 * One asset, rendered the way its own kind wants to be seen.
 *
 * A mesh gets a download rather than a media element: there is no <model> tag,
 * and a 25 MB glb is not something to load inline on a page that may show
 * dozens of them.
 */
export function AssetTile({
  asset,
  badge,
  similar = false,
}: {
  asset: { id: string; type: string; published?: boolean };
  /**
   * Offers "Similar" on this tile. Only for embeddable kinds, and only in the
   * library — a feed tile is somebody else's asset, and searching your own
   * library for something like it would return nothing of theirs.
   */
  similar?: boolean;
  /** Position within a set, when the asset came from a batch. */
  badge?: string;
}) {
  return (
    <div className="tile group">
      {/* One scrim behind every label, rather than a pill behind each: sixty
          tiles with four floating pills apiece is noise, and a scrim keeps
          white text legible over whatever the image happens to be. */}
      <div
        className="tile-chrome pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent 35%, transparent 60%, rgba(0,0,0,0.65))",
        }}
        aria-hidden="true"
      />
      <span className="tile-chrome absolute left-2 top-2 z-20 text-[10px] font-semibold uppercase tracking-wide text-white">
        {TYPE_LABELS[asset.type] ?? asset.type}
      </span>
      {badge !== undefined && (
        <span className="tile-chrome tabular absolute right-2 top-2 z-20 font-mono text-[10px] font-semibold text-white">
          {badge}
        </span>
      )}

      {asset.type === "image" && (
        <img
          src={`/api/assets/${asset.id}`}
          alt="Generated asset"
          loading="lazy"
          className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
        />
      )}
      {asset.type === "video" && (
        <video
          src={`/api/assets/${asset.id}`}
          controls
          preload="metadata"
          className="aspect-square w-full object-cover"
        />
      )}
      {asset.type === "audio" && (
        <div className="flex aspect-square w-full items-center justify-center bg-[var(--bg-elevated)] p-6">
          <audio
            src={`/api/assets/${asset.id}`}
            controls
            preload="metadata"
            className="w-full"
          />
        </div>
      )}
      {/* Sharing sits on the tile rather than in a menu: it is a per-asset
          decision, and one buried behind a menu is one nobody makes. Absent
          when the caller did not load the flag — a feed tile is not a place to
          publish from. */}
      {(asset.published !== undefined || similar) && (
        <div className="tile-chrome absolute bottom-2 right-2 z-20 flex items-center gap-1.5">
          {similar && (asset.type === "image" || asset.type === "video") && (
            // A link, not a fetch: the search it runs is the same one the
            // search box runs, and putting the id in the URL means the result
            // can be reloaded, shared, and reached with the back button.
            <Link
              href={`/gallery?similarTo=${encodeURIComponent(asset.id)}`}
              className="opt !py-1 text-[11px]"
            >
              Similar
            </Link>
          )}
          {asset.published !== undefined && (
            <PublishToggle assetId={asset.id} published={asset.published} />
          )}
        </div>
      )}

      {asset.type === "model3d" && (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 bg-[var(--bg-elevated)] p-6 text-center">
          <span className="gradient-ring h-10 w-10 rounded-[14px] opacity-60" aria-hidden="true" />
          <p className="text-xs text-[var(--text-muted)]">3D mesh (.glb)</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {/* The viewer is only fetched when asked for: a mesh is ~25 MB and
                a gallery can hold dozens. */}
            <MeshViewer assetId={asset.id} />
            <a
              href={`/api/assets/${asset.id}`}
              download
              className="btn-secondary !px-3 !py-1.5 text-xs"
            >
              Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
