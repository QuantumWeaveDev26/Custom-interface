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
}: {
  asset: { id: string; type: string; published?: boolean };
  /** Position within a set, when the asset came from a batch. */
  badge?: string;
}) {
  return (
    <div className="group relative">
      <span className="absolute left-2 top-2 z-10 rounded-[10px] bg-black/75 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
        {TYPE_LABELS[asset.type] ?? asset.type}
      </span>
      {badge !== undefined && (
        <span className="absolute right-2 top-2 z-10 rounded-[10px] tabular bg-black/75 px-2 py-1 font-mono text-[10px] font-semibold text-white">
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
      {asset.published !== undefined && (
        <div className="absolute bottom-2 right-2 z-10">
          <PublishToggle assetId={asset.id} published={asset.published} />
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
