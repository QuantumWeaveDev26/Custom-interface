import { auth } from "@/auth";
import { CREDIT_PRICING } from "@/server/config";
import { listDocuments } from "@/server/knowledge";
import { prisma } from "@creative-ai/db";
import {
  DEFAULT_IMAGE_PARAMS,
  DEFAULT_MODEL3D_PARAMS,
  DEFAULT_VIDEO_PARAMS,
  DEFAULT_VOICE_PARAMS,
  creditCostFor,
} from "@creative-ai/shared-types";
import { redirect } from "next/navigation";

import { AssistantClient } from "./assistant-client";

export default async function AssistantPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const documents = (await listDocuments(session.user.id)).map((doc) => ({
    id: doc.id,
    title: doc.title,
    collection: doc.collection,
    chunks: doc.chunks,
  }));

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { creditBalance: true },
  });

  // What one take costs in each department, priced with the same function the
  // server charges with. The assistant can then say the price before anyone
  // presses anything — a confirmation without a number is not a confirmation.
  const costs = {
    image: creditCostFor(DEFAULT_IMAGE_PARAMS, CREDIT_PRICING),
    video: creditCostFor(DEFAULT_VIDEO_PARAMS, CREDIT_PRICING),
    voice: creditCostFor(DEFAULT_VOICE_PARAMS, CREDIT_PRICING),
    model3d: creditCostFor(DEFAULT_MODEL3D_PARAMS, CREDIT_PRICING),
  };

  return (
    <AssistantClient
      documents={documents}
      costs={costs}
      creditBalance={user?.creditBalance ?? 0}
    />
  );
}
