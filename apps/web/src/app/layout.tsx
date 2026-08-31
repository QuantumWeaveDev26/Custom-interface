import { ReactNode } from "react";
import { Inter } from "next/font/google";
import { auth, signOut } from "@/auth";
import { NavBar } from "@/components/nav-bar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

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
    <html lang="en" className={inter.variable}>
      {/* The shell is a column so a page can ask to fill what is left below the
          nav, rather than guessing the nav's height in a calc. */}
      <body className="flex h-full flex-col font-sans">
        {session?.user && (
          <NavBar
            signOutAction={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          />
        )}
        {/* Pages that are taller than the shell scroll here. Studio asks for
            h-full instead and scrolls inside its own columns. */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </body>
    </html>
  );
}
