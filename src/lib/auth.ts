import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { checkRateLimit, clientIp } from "./rate-limit";
import { verifyCredentials } from "./credential-auth";
import { getSessionAuthState, isSessionStillValid } from "./session-guard";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
      /**
       * Server-resolved tenant identity (see src/lib/organization.ts). Never
       * accept this from client input; it comes from the User row's own
       * organizationId column via getSessionAuthState(), set on sign-in and
       * re-verified on every subsequent request exactly like role/authVersion
       * (no extra query - it rides the same per-request revocation check).
       */
      organizationId: string;
    };
  }
  interface User {
    role: Role;
    authVersion: number;
    organizationId: string;
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        // Rate-limited by IP+email so a distributed attacker still gets
        // throttled per-target-account, not just per-IP.
        const ip = request ? clientIp(request) : "unknown";
        const limitResult = await checkRateLimit("login", `${ip}:${email.toLowerCase()}`);
        if (!limitResult.allowed) return null;

        return verifyCredentials(email, password);
      },
    }),
  ],
  callbacks: {
    /**
     * Runs on sign-in and again on every authenticated request (proxy.ts and
     * every `requireSession()` call go through `auth()`, which invokes this).
     * That existing per-request pass is what makes session revocation cheap:
     * one indexed lookup of three scalar columns, no extra middleware hop.
     *
     * Returning null invalidates the session, so a token whose `authVersion`
     * no longer matches the database - after a password reset, a password
     * change, or an admin disabling the account - stops being accepted
     * immediately, as does a token for a user who was deleted or is no longer
     * ACTIVE.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: Role }).role;
        token.authVersion = (user as { authVersion: number }).authVersion;
        token.organizationId = (user as { organizationId: string }).organizationId;
        return token;
      }
      if (typeof token.id !== "string") return null;
      const state = await getSessionAuthState(token.id);
      if (!isSessionStillValid(state, token.authVersion)) return null;
      // Role AND organization changes made by an admin take effect on the
      // next request too - this is the same per-request DB check that
      // already re-verifies role/authVersion, so re-deriving organizationId
      // here costs nothing extra (one indexed lookup, not a new query).
      token.role = state!.role;
      token.organizationId = state!.organizationId;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      session.user.organizationId = token.organizationId as string;
      return session;
    },
  },
});
