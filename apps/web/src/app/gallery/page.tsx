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
  searchParams: Promise<{ type?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  // The filter lives in the URL rather than component state, so it survives a
  // reload, can be linked, and works before any JavaScript has run.
  const filter = parseGalleryFilter((await searchParams).type);

  const assets = await prisma.asset.findMany({
    where: {
      userId: session.user.id,
      ...(filter === "all" ? {} : { type: filter }),
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, jobId: true, createdAt: true },
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

  const rows = toGalleryRows(groupAssets(assets));

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Gallery</h1>
        <Link href="/studio" className="btn-secondary !px-4 !py-2 text-sm">
          Back to Studio
        </Link>
      </div>

      {totalAssets > 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {(Object.keys(FILTER_LABELS) as GalleryFilter[]).map((option) => {
            const active = filter === option;
            return (
              <Link
                key={option}
                href={option === "all" ? "/gallery" : `/gallery?type=${option}`}
                aria-current={active ? "page" : undefined}
                className="pill !px-3 !py-1.5 text-xs"
                data-active={active}
                style={
                  active
                    ? undefined
                    : { background: "var(--surface)", border: "1px solid var(--border)" }
                }
              >
                {FILTER_LABELS[option]}
              </Link>
            );
          })}
        </div>
      )}

      {totalAssets > 0 && <GallerySearch unindexedCount={unindexedCount} />}

      {totalAssets === 0 ? (
        <div className="card mt-8 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="gradient-ring h-10 w-10 rounded-[6px] opacity-60" aria-hidden="true" />
          <p className="text-sm text-[var(--text-muted)]">
            Nothing generated yet. Head to the Studio to create your first asset.
          </p>
          <Link href="/studio" className="btn-primary mt-2">
            Go to Studio
          </Link>
        </div>
      ) : assets.length === 0 ? (
        <div className="mt-6 rounded-[3px] border border-dashed border-[var(--border)] px-6 py-10 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            No {FILTER_LABELS[filter].toLowerCase()} yet.
          </p>
          <Link href="/gallery" className="btn-secondary mt-4 !px-4 !py-2 text-xs">
            Show everything
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {rows.map((row) =>
            row.kind === "set" ? (
              // A batch is one answer to one prompt, so it is framed as one
              // result rather than scattered through the grid as N unrelated
              // ones.
              <section
                key={row.key}
                className="rounded-[3px] border p-3"
                style={{ borderColor: "var(--border)" }}
                aria-label={`Set of ${row.assets.length}`}
              >
                <p className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-[var(--text-faint)]">
                  Set of {row.assets.length}
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {row.assets.map((asset, index) => (
                    <div key={asset.id} className="card overflow-hidden">
                      <AssetTile asset={asset} badge={String(index + 1)} />
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <div
                key={row.key}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              >
                {row.assets.map((asset) => (
                  <div key={asset.id} className="card overflow-hidden">
                    <AssetTile asset={asset} />
                  </div>
                ))}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
