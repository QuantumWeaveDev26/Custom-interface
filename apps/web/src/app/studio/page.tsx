import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@creative-ai/db";
import {
  CREDIT_PRICING,
  IMAGE_MODEL,
  MODEL3D_MODEL,
  VIDEO_MODEL,
  VIDEO_MODELS,
  VOICE_MODEL,
} from "@/server/config";
import {
  videoCapabilitiesFor,
  type VideoResolutionLimits,
} from "@creative-ai/shared-types";
import { listCharacters } from "@/server/characters";
import { StudioClient } from "./studio-client";

export default async function StudioPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { creditBalance: true },
  });

  // Capabilities come from the server-resolved model so the UI can only offer
  // settings the server would accept. Pricing is passed down so the cost
  // preview uses the same function the server charges with.
  // Every resolution any configured model offers, and the duration ceiling of
  // each — the client needs both, because picking 4K changes which model serves
  // the job and therefore how long the clip may be.
  const videoResolutionLimits: VideoResolutionLimits = Object.fromEntries(
    VIDEO_MODELS.flatMap((model) => {
      const caps = videoCapabilitiesFor(model);
      return caps.resolutions.map((resolution) => [
        resolution,
        {
          model,
          minDurationSeconds: caps.minDurationSeconds,
          maxDurationSeconds: caps.maxDurationSeconds,
        },
      ]);
    }),
  );

  // Recent images the user owns, offered as first-frame candidates for
  // image-to-video. Scoped to this user — the API re-checks ownership at
  // submission regardless.
  const recentImages = await prisma.asset.findMany({
    where: { userId: session.user.id, type: "image" },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true },
  });

  // Recent clips the user owns, offered as source videos for extend/edit.
  const recentVideos = await prisma.asset.findMany({
    where: { userId: session.user.id, type: "video" },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true },
  });

  const characters = await listCharacters(session.user.id);

  return (
    <StudioClient
      characters={characters}
      creditBalance={user?.creditBalance ?? 0}
      recentImageIds={recentImages.map((asset) => asset.id)}
      recentVideoIds={recentVideos.map((asset) => asset.id)}
      imageModelLabel={IMAGE_MODEL}
      videoModelLabel={VIDEO_MODEL}
      voiceModelLabel={VOICE_MODEL}
      model3dModelLabel={MODEL3D_MODEL}
      videoResolutionLimits={videoResolutionLimits}
      pricing={CREDIT_PRICING}
    />
  );
}
