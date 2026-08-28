import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { MarketingClient } from "./marketing-client";

export default async function MarketingPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  return <MarketingClient />;
}
