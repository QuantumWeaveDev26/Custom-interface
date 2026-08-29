import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@creative-ai/db";
import Link from "next/link";

import { GallerySearch } from "./gallery-search";

const TYPE_LABELS: Record<string, string> = {
  image: "Image",
  video: "Video",
  audio: "Voice",
  model3d: "3D",
};

export default async function GalleryPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const assets = await prisma.asset.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  // Only image and video assets can be embedded, so audio is excluded from the
  // "not yet indexed" count — otherwise it would never reach zero.
  const unindexedCount = await prisma.asset.count({
    where: {
      userId: session.user.id,
      type: { in: ["image", "video"] },
      embedding: { is: null },
    },
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Gallery</h1>
        <Link href="/studio" className="btn-secondary !px-4 !py-2 text-sm">
          Back to Studio
        </Link>
      </div>

      {assets.length > 0 && <GallerySearch unindexedCount={unindexedCount} />}

      {assets.length === 0 ? (
        <div className="card mt-8 flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="gradient-ring h-10 w-10 rounded-2xl opacity-60" aria-hidden="true" />
          <p className="text-sm text-[var(--text-muted)]">
            Nothing generated yet. Head to the Studio to create your first asset.
          </p>
          <Link href="/studio" className="btn-primary mt-2">
            Go to Studio
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <div key={asset.id} className="card group overflow-hidden">
              <div className="relative">
                <span className="absolute left-2 top-2 z-10 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                  {TYPE_LABELS[asset.type] ?? asset.type}
                </span>
                {asset.type === "image" && (
                  <img
                    src={`/api/assets/${asset.id}`}
                    alt="Generated asset"
                    className="aspect-square w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
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
                {asset.type === "model3d" && (
                  <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 bg-[var(--bg-elevated)] p-6 text-center">
                    <span className="gradient-ring h-10 w-10 rounded-2xl opacity-60" aria-hidden="true" />
                    <p className="text-xs text-[var(--text-muted)]">
                      3D mesh (.glb)
                    </p>
                    <a
                      href={`/api/assets/${asset.id}`}
                      download
                      className="btn-secondary !px-3 !py-1.5 text-xs"
                    >
                      Download
                    </a>
                  </div>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
