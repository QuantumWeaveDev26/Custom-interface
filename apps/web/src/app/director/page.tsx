import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listCharacters } from "@/server/characters";
import { CREDIT_PRICING, VIDEO_MODELS } from "@/server/config";
import {
  MAX_CHAIN_ROUNDS,
  creditCostFor,
  videoCapabilitiesFor,
} from "@creative-ai/shared-types";

import { DirectorClient } from "./director-client";

export default async function DirectorPage({
  searchParams,
}: {
  searchParams: Promise<{ brief?: string }>;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  // Filming a plan as one continuous piece is a chain, so the page needs the
  // same two facts the Studio composer needs: what the serving model will
  // accept, and what it costs. Both come from the server so the button cannot
  // offer something the API would reject or quote a price it would not charge.
  const capabilities = videoCapabilitiesFor(VIDEO_MODELS[0] ?? "");
  // Capped at the same 500 characters the planning route accepts, so a brief
  // handed over from the assistant cannot arrive already too long to submit.
  const brief = (await searchParams).brief?.slice(0, 500);

  return (
    <DirectorClient
      characters={await listCharacters(session.user.id)}
      {...(brief === undefined || brief.trim().length === 0 ? {} : { initialBrief: brief })}
      filmLimits={{
        minDurationSeconds: capabilities.minDurationSeconds,
        maxDurationSeconds: capabilities.maxDurationSeconds,
        maxShots: MAX_CHAIN_ROUNDS,
      }}
      creditsPerSecond={
        creditCostFor(
          {
            type: "video",
            resolution: "720p",
            ratio: "21:9",
            durationSeconds: 1,
            withAudio: true,
            rounds: 1,
          },
          CREDIT_PRICING,
        )
      }
    />
  );
}
