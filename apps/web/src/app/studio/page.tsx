import { auth } from "@/auth";
import { redirect } from "next/navigation";

export default async function StudioPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/sign-in");
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold">Studio</h1>
        <p className="mt-2 text-gray-600">Create AI-generated art</p>
      </div>
    </div>
  );
}
