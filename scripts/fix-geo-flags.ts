/**
 * Одноразово: виправити geo.flag у БД (де збережено "CA" замість emoji).
 * Usage: npx tsx scripts/fix-geo-flags.ts
 */
import { PrismaClient } from "@prisma/client";
import { flagFromCode, resolveStoredFlag } from "../src/lib/geo-flag";

const prisma = new PrismaClient();

async function main() {
  const geos = await prisma.geo.findMany();
  let fixed = 0;
  for (const g of geos) {
    const next = resolveStoredFlag(g.flag, g.code);
    if (next !== g.flag) {
      await prisma.geo.update({ where: { id: g.id }, data: { flag: next } });
      console.log(`  ${g.code}: "${g.flag ?? ""}" → "${next ?? "(null, use code img)"}"`);
      fixed++;
    } else {
      console.log(`  ${g.code}: ok`);
    }
  }
  console.log(`\nDone. Updated ${fixed}/${geos.length} geos.`);
  console.log("Display uses ISO code for PNG flags — DB flag field is optional.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
