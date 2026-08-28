import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { TranscribeClient } from "./transcribe-client";

export default async function TranscribePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  return <TranscribeClient />;
}
