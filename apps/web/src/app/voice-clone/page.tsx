import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { VoiceCloneClient } from "./voice-clone-client";

export default async function VoiceClonePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  return <VoiceCloneClient />;
}
