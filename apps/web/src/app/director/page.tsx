import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { listCharacters } from "@/server/characters";
import { DirectorClient } from "./director-client";

export default async function DirectorPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  return <DirectorClient characters={await listCharacters(session.user.id)} />;
}
