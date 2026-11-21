/**
 * Одноразовий скрипт: скидання пароля адміна.
 * Usage (на сервері, під deployops):
 *   cd /opt/deployops
 *   RESET_EMAIL=admin@example.com RESET_PASSWORD='YourNewPass' npx tsx scripts/reset-admin-password.ts
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(
      `Usage: RESET_EMAIL=... RESET_PASSWORD='...' npx tsx scripts/reset-admin-password.ts`,
    );
    console.error(`Missing env: ${name}`);
    process.exit(1);
  }
  return v;
}

const prisma = new PrismaClient();

async function main() {
  const email = requireEnv("RESET_EMAIL");
  const password = requireEnv("RESET_PASSWORD");

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User not found: ${email}`);
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 12);
  await prisma.user.update({ where: { email }, data: { passwordHash: hash } });
  console.log(`Password reset OK for: ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
