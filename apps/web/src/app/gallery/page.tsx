import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@creative-ai/db";
import Link from "next/link";

import { AssetTile } from "./asset-tile";
import { GallerySearch } from "./gallery-search";
import {
  groupAssets,
  parseGalleryFilter,
  toGalleryRows,
  type GalleryFilter,
} from "./group-assets";

const FILTER_LABELS: Record<GalleryFilter, string> = {
  all: "All",
  image: "Images",
  video: "Video",
  audio: "Voice",
  model3d: "3D",
};

export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; similarTo?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  // The filter lives in the URL rather than component state, so it survives a
  // reload, can be linked, and works before any JavaScript has run.
  const params = await searchParams;
  const filter = parseGalleryFilter(params.type);

  const assets = await prisma.asset.findMany({
    where: {
      userId: session.user.id,
      ...(filter === "all" ? {} : { type: filter }),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, jobId: true, createdAt: true, publishedAt: true },
  });

  // Counted unfiltered, so an empty filtered view can say "no video yet"
  // instead of showing the same message as a brand-new account.
  const totalAssets = await prisma.asset.count({ where: { userId: session.user.id } });

  // Only image and video assets can be embedded, so audio and meshes are
  // excluded from the "not yet indexed" count -- otherwise it would never
  // reach zero.
  const unindexedCount = await prisma.asset.count({
    where: {
      userId: session.user.id,
      type: { in: ["image", "video"] },
      embedding: { is: null },
    },
  });

  const autoIndex =
    (
      await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { autoIndexAssets: true },
      })
    )?.autoIndexAssets ?? false;

  const rows = toGalleryRows(
    groupAssets(
      assets.map((asset) => ({ ...asset, published: asset.publishedAt !== null })),
    ),
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      {/* Title, filters and count on one bar. A library is browsed by filtering
          and scanning, so the controls that do that belong together and stay
          put — they are sticky, because a filter you have to scroll back up to
          reach stops being used. */}
      <header
        className="sticky top-0 z-30 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-b px-4 pb-4 pt-1 sm:-mx-6 sm:px-6"
        style={{ background: "var(--bg)", borderColor: "var(--border)" }}
      >
        <h1 className="text-xl font-semibold tracking-tight">Gallery</h1>

        {totalAssets > 0 && (
          <>
            <nav className="flex flex-wrap gap-1.5" aria-label="Filter by type">
              {(Object.keys(FILTER_LABELS) as GalleryFilter[]).map((option) => {
                const active = filter === option;
                return (
                  <Link
                    key={option}
                    href={option === "all" ? "/gallery" : `/gallery?type=${option}`}
                    aria-current={active ? "page" : undefined}
                    className="opt"
                    data-active={active}
                  >
                    {FILTER_LABELS[option]}
                  </Link>
                );
              })}
            </nav>

            <p className="val ml-auto text-[13px] text-[var(--text-faint)]">
              {assets.length}
              {filter === "all" ? "" : ` of ${totalAssets}`}
            </p>
          </>
        )}

        <Link href="/studio" className="btn-secondary !px-4 !py-2 text-sm">
          Back to Studio
        </Link>
      </header>

      {totalAssets > 0 && <GallerySearch unindexedCount={unindexedCount} autoIndex={autoIndex} />}

      {totalAssets === 0 ? (
        <div className="card mt-8 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="gradient-ring h-10 w-10 rounded-[14px] opacity-60" aria-hidden="true" />
          <p className="text-sm text-[var(--text-muted)]">
            Nothing generated yet. Head to the Studio to create your first asset.
          </p>
          <Link href="/studio" className="btn-primary mt-2">
            Go to Studio
          </Link>
        </div>
      ) : assets.length === 0 ? (
        <div className="mt-6 rounded-[18px] border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            No {FILTER_LABELS[filter].toLowerCase()} yet.
          </p>
          <Link href="/gallery" className="btn-secondary mt-4 !px-4 !py-2 text-xs">
            Show everything
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {rows.map((row) =>
            row.kind === "set" ? (
              // A batch is one answer to one prompt, so it is framed as one
              // result rather than scattered through the grid as N unrelated
              // ones.
              <section
                key={row.key}
                className="panel p-3"
                aria-label={`Set of ${row.assets.length}`}
              >
                <p className="rule-cap mb-2 px-1">
                  Set of {row.assets.length}
                </p>
                {/* Tiles sit flush inside the band: the band is already the
                    frame that says these belong together, and framing each
                    member again is a border inside a border. */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {row.assets.map((asset, index) => (
                    <AssetTile
                      key={asset.id}
                      asset={asset}
                      badge={String(index + 1)}
                      similar
                    />
                  ))}
                </div>
              </section>
            ) : (
              // Unframed and tight: a library of work reads as a body of
              // work, not as a filing cabinet of separately mounted items.
              // Four across leaves each tile large enough to judge.
              <div
                key={row.key}
                className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"
              >
                {row.assets.map((asset) => (
                  <AssetTile key={asset.id} asset={asset} similar />
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
