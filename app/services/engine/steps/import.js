import { registerStep } from './index.js';
import { importListings } from '../../shopify/importer.js';
import prisma from '../../../db.server.js';

registerStep('import', {
  async execute(ctx) {
    const { importEnabled = false } = ctx.config;
    const admin = ctx.config._admin || null;

    if (!importEnabled) {
      ctx.log('SYSTEM', 'Auto-import disabled — products ready to import manually');
      return { data: {} };
    }

    if (!admin) {
      ctx.log('SYSTEM', 'Auto-import skipped — no Shopify admin context. Use Import button in UI.');
      return { data: {} };
    }

    const filtered = ctx.stepData.filteredProducts;
    if (!filtered?.length) return { data: {} };

    await ctx.setPhase(5, `importing ${filtered.length} listings`);
    ctx.log('IMPORT', 'Creating store listings…');

    const importResult = await importListings(filtered, admin);
    let imported = 0;

    for (const r of importResult.results) {
      const product = filtered.find(x => x.id === r.id);
      if (r.ok) {
        imported++;
        ctx.log('IMPORT', `Listed: "${product?.name}"`, 'import');
        const dbProd = await prisma.engineProduct.findFirst({
          where: { engineRunId: ctx.runId, sourceId: r.id },
        });
        if (dbProd) {
          await prisma.engineProduct.update({
            where: { id: dbProd.id },
            data: { imported: true, shopifyProductId: r.shopifyId || null },
          });
        }
      } else {
        ctx.log('IMPORT', `Failed: ${product?.name || r.id} — ${r.error || r.status}`, 'warn');
      }
    }

    ctx.log('IMPORT', `${imported}/${filtered.length} products imported`);
    return { data: { importedCount: imported } };
  },
});
