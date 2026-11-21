import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "./prisma";
import { rateLimit } from "./rate-limit";

const credSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

function extractIp(req: Request | undefined): string {
  if (!req) return "unknown";
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  trustHost: true,
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw, req) {
        const parsed = credSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.trim().toLowerCase();
        const password = parsed.data.password;

        // SECURITY: rate-limit per IP (10/хв) і per email (5/хв) — захист
        // від credential-stuffing. Повертаємо null, як для невірного пароля,
        // щоб не виявляти, чи існує користувач.
        const ip = extractIp(req as Request | undefined);
        const perIp = rateLimit(`login:ip:${ip}`, 10);
        if (!perIp.allowed) return null;
        const perEmail = rateLimit(`login:email:${email}`, 5);
        if (!perEmail.allowed) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          // Робимо dummy-compare, щоб timing-side-channel не показав існування юзера.
          await bcrypt.compare(password, "$2a$12$0000000000000000000000.0000000000000000000000000000");
          return null;
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          groupId: user.groupId,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.role = (user as any).role;
        token.groupId = (user as any).groupId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).groupId = token.groupId;
      }
      return session;
    },
  },
});
