import NextAuth, { type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";

import { prisma, createUserWithWelcomeGrant } from "@creative-ai/db";

const adapter = PrismaAdapter(prisma);

// Wrap the adapter's createUser to add welcome-grant credits
const createUserWithWelcomeGrantAdapter = {
  ...adapter,
  createUser: async (user: any) => {
    return await createUserWithWelcomeGrant({
      email: user.email,
      name: user.name ?? null,
      emailVerified: user.emailVerified ?? null,
      image: user.image ?? null,
    });
  },
};

const config: NextAuthConfig = {
  adapter: createUserWithWelcomeGrantAdapter,
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
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
