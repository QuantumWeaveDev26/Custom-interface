import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@creative-ai/db";
import { IMAGE_MODEL, VIDEO_MODEL, VOICE_MODEL } from "@/server/config";
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

  return (
    <StudioClient
      creditBalance={user?.creditBalance ?? 0}
      imageModelLabel={IMAGE_MODEL}
      videoModelLabel={VIDEO_MODEL}
      voiceModelLabel={VOICE_MODEL}
    />
  );
}
