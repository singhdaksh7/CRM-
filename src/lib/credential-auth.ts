import "server-only";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || user.status !== "ACTIVE") return null;
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
