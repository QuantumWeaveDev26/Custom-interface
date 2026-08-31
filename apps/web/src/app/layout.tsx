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
        {/* First stop for a keyboard user. Without it, reaching the page means
            tabbing past every nav link on every navigation. Visually hidden
            until focused, which is the one time it is useful. */}
        <a
          href="#main"
          className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-4 focus-visible:top-4 focus-visible:z-50 focus-visible:rounded-[10px] focus-visible:bg-[var(--signal)] focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-semibold focus-visible:text-[var(--signal-ink)]"
        >
          Skip to content
        </a>

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
        <main id="main" className="min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
