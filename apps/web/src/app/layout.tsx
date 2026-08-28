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
      <body className="font-sans">
        {session?.user && (
          <NavBar
            signOutAction={async () => {
              "use server";
              await signOut({ redirectTo: "/sign-in" });
            }}
          />
        )}
        {children}
      </body>
    </html>
  );
}
