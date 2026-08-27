import { ReactNode } from "react";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import "./globals.css";

export const metadata = {
  title: "Creative AI",
  description: "Create and explore AI-generated art",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  return (
    <html lang="en">
      <body>
        {session?.user && (
          <nav className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
              <div className="flex gap-4 text-sm font-medium">
                <Link href="/studio" className="hover:underline">
                  Studio
                </Link>
                <Link href="/director" className="hover:underline">
                  Director
                </Link>
                <Link href="/gallery" className="hover:underline">
                  Gallery
                </Link>
              </div>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/sign-in" });
                }}
              >
                <button type="submit" className="text-sm text-gray-600 hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        )}
        {children}
      </body>
    </html>
  );
}
