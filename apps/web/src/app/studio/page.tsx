import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@creative-ai/db";
import { CREDIT_PRICING, IMAGE_MODEL, VIDEO_MODEL, VOICE_MODEL } from "@/server/config";
import { videoCapabilitiesFor } from "@creative-ai/shared-types";
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
  const videoCapabilities = videoCapabilitiesFor(VIDEO_MODEL);

  return (
    <StudioClient
      creditBalance={user?.creditBalance ?? 0}
      imageModelLabel={IMAGE_MODEL}
      videoModelLabel={VIDEO_MODEL}
      voiceModelLabel={VOICE_MODEL}
      videoResolutions={[...videoCapabilities.resolutions]}
      minDurationSeconds={videoCapabilities.minDurationSeconds}
      maxDurationSeconds={videoCapabilities.maxDurationSeconds}
      pricing={CREDIT_PRICING}
    />
  );
}
