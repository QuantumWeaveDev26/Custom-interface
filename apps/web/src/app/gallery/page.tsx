import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@creative-ai/db";
import Link from "next/link";

export default async function GalleryPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const assets = await prisma.asset.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Gallery</h1>
        <Link href="/studio" className="text-sm font-medium underline">
          Back to Studio
        </Link>
      </div>

      {assets.length === 0 ? (
        <p className="mt-6 text-sm text-gray-600">
          Nothing generated yet. Head to the Studio to create your first asset.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((asset) => (
            <div key={asset.id} className="overflow-hidden rounded border border-gray-200 p-2">
              {asset.type === "image" && (
                <img
                  src={`/api/assets/${asset.id}`}
                  alt="Generated asset"
                  className="w-full object-cover"
                />
              )}
              {asset.type === "video" && (
                <video
                  src={`/api/assets/${asset.id}`}
                  controls
                  preload="metadata"
                  className="w-full"
                />
              )}
              {asset.type === "audio" && (
                <audio src={`/api/assets/${asset.id}`} controls preload="metadata" className="w-full" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
