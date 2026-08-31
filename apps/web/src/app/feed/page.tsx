import { auth } from "@/auth";
import { loadFeed } from "@creative-ai/db";
import { redirect } from "next/navigation";

import { AssetTile } from "../gallery/asset-tile";

// A feed is a browsing surface, not a library: one screenful of the newest
// shares, no pagination until there is enough published work to need it.
const FEED_LIMIT = 60;

export default async function FeedPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin");

  const items = await loadFeed(FEED_LIMIT);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold tracking-tight">Feed</h1>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        What people chose to share. Publish your own from the Gallery.
      </p>

      {items.length === 0 ? (
        <p className="mt-10 text-sm text-[var(--text-muted)]">
          Nothing has been shared yet. Anything you publish from your Gallery
          shows up here, prompt and all.
        </p>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <article key={item.assetId} className="panel overflow-hidden">
              {/* No `published` prop: the share control belongs on your own
                  asset in the Gallery, not on somebody else's here. */}
              <AssetTile asset={{ id: item.assetId, type: item.type }} />
              {item.prompt !== null && (
                <p className="border-t border-[var(--border)] p-3 text-xs text-[var(--text-muted)]">
                  {item.prompt}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
