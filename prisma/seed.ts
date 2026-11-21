import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Markets start empty — admins create them in /admin/geos.
const DEFAULT_GEOS: Array<{ code: string; name: string; flag: string }> = [];

// Server layout presets: they only define where a site's web root lives on the VPS
// and which system user owns the files.
const DEFAULT_SETUPS = [
  {
    key: "default",
    name: "Default (nginx /var/www)",
    webRootTemplate: "/var/www/{domain}",
    webUser: "www-data",
    isBuiltin: true,
  },
  {
    key: "react",
    name: "Static build (/var/www/{domain}/build)",
    webRootTemplate: "/var/www/{domain}/build",
    webUser: "www-data",
    isBuiltin: true,
  },
  {
    key: "hestia",
    name: "Panel hosting (/home/admin/web/{domain}/public_html)",
    webRootTemplate: "/home/admin/web/{domain}/public_html",
    webUser: "admin",
    isBuiltin: true,
  },
  {
    key: "hestia_react",
    name: "Panel hosting + static build",
    webRootTemplate: "/home/admin/web/{domain}/public_html",
    webUser: "admin",
    isBuiltin: true,
  },
];

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "change_me_strong";

  // SECURITY: the password hash is NOT overwritten on re-seed.
  // Otherwise any `pnpm db:seed` run (e.g. to add markets) would silently
  // reset the admin password to the SEED_ADMIN_PASSWORD value from .env.
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    if (existing.role !== "admin") {
      await prisma.user.update({ where: { email }, data: { role: "admin" } });
      console.log(`✓ admin user: ${existing.email} (role restored to admin)`);
    } else {
      console.log(`✓ admin user: ${existing.email} (already exists, password preserved)`);
    }
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const created = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: "admin",
        name: "Root Admin",
      },
    });
    console.log(`✓ admin user: ${created.email} (created)`);
  }

  for (const geo of DEFAULT_GEOS) {
    const row = await prisma.geo.upsert({
      where: { code: geo.code },
      update: {},
      create: geo,
    });
    console.log(`  ✓ market ${row.code} ${row.flag ?? ""}`);
  }

  for (const s of DEFAULT_SETUPS) {
    const row = await prisma.serverSetup.upsert({
      where: { key: s.key },
      update: {
        name: s.name,
        webRootTemplate: s.webRootTemplate,
        webUser: s.webUser,
        isBuiltin: s.isBuiltin,
      },
      create: s,
    });
    console.log(`  ✓ setup ${row.key} → ${row.webRootTemplate}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
