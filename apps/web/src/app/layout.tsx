import { ReactNode } from "react";
import { auth } from "@/auth";
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
        {children}
      </body>
    </html>
  );
}
