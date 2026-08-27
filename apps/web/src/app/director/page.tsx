import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { DirectorClient } from "./director-client";

export default async function DirectorPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  return <DirectorClient />;
}
