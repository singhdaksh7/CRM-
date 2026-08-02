import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { checkRateLimit, clientIp } from "./rate-limit";
import type { Role } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name: string;
      email: string;
      role: Role;
    };
  }
  interface User {
    role: Role;
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

        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!user || user.status !== "ACTIVE") return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = (user as { role: Role }).role;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as Role;
      return session;
    },
  },
});
