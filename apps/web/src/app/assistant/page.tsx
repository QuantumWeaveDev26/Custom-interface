import { auth } from "@/auth";
import { listDocuments } from "@/server/knowledge";
import { redirect } from "next/navigation";

import { AssistantClient } from "./assistant-client";

export default async function AssistantPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  const documents = (await listDocuments(session.user.id)).map((doc) => ({
    id: doc.id,
    title: doc.title,
    chunks: doc.chunks,
  }));

  return <AssistantClient documents={documents} />;
}
