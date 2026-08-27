import NextAuth, { type NextAuthConfig } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { prisma, createUserWithWelcomeGrant } from "@creative-ai/db";

const adapter = PrismaAdapter(prisma);

const INITIAL_CREDITS = parseInt(process.env.INITIAL_CREDITS || "100", 10);
// Empty string (not undefined) so the module can be imported during build/typecheck
// without live credentials; an actual Google sign-in attempt fails at request time
// if these were never configured in the environment.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";

// Wrap the adapter's createUser so a new user, the welcome-grant balance,
// and the ledger entry are created atomically in one transaction.
const createUserWithWelcomeGrantAdapter = {
  ...adapter,
  createUser: async (user: Omit<AdapterUser, "id">) => {
    const created = await prisma.$transaction((tx) =>
      createUserWithWelcomeGrant(
        {
          user: {
            create: async ({ data }) => tx.user.create({ data }),
          },
          creditLedgerEntry: {
            create: async ({ data }) => tx.creditLedgerEntry.create({ data }),
          },
        },
        {
          email: user.email,
          name: user.name ?? null,
          emailVerified: user.emailVerified ?? null,
          image: user.image ?? null,
        },
        INITIAL_CREDITS,
      ),
    );
    return created as AdapterUser;
  },
};

const config: NextAuthConfig = {
  adapter: createUserWithWelcomeGrantAdapter,
  secret: process.env.NEXTAUTH_SECRET ?? "",
  session: { strategy: "database" },
  providers: [
    Resend({
      from: process.env.AUTH_EMAIL_FROM || "noreply@creative-ai.example",
      sendVerificationRequest: async ({ identifier: email, url }) => {
        // The email link uses the verification token in the auth callback
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.AUTH_RESEND_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.AUTH_EMAIL_FROM || "noreply@creative-ai.example",
            to: email,
            subject: "Sign in to Creative AI",
            html: `<p>Click <a href="${url}">here</a> to sign in.</p>`,
          }),
        });

        if (!response.ok) {
          throw new Error("Failed to send verification email");
        }
      },
    }),
    Google({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async redirect({ baseUrl, url }) {
      // Allow relative urls
      if (url.startsWith("/")) {
        return `${baseUrl}${url}`;
      }
      // Allow same origin urls
      if (new URL(url).origin === baseUrl) {
        return url;
      }
      return baseUrl;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
