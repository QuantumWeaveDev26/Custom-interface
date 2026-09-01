import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { AssistantClient } from "./assistant-client";

export default async function AssistantPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  return <AssistantClient />;
}
