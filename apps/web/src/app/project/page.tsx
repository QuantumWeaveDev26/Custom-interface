import { auth } from "@/auth";
import { SUGGESTED_FIELDS } from "@/server/project-record-text";
import { listRecords } from "@/server/project-records";
import { redirect } from "next/navigation";

import { ProjectClient } from "./project-client";

export default async function ProjectPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/sign-in");

  return (
    <ProjectClient
      initialRecords={await listRecords(session.user.id)}
      suggestedFields={SUGGESTED_FIELDS}
    />
  );
}
