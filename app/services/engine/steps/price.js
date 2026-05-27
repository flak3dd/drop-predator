import { registerStep } from './index.js';
import { computePricingWithCompetitors } from '../../shopify/pricing.js';
import { getCompetitorIntel } from '../../shopify/competitor-price.js';
import prisma from '../../../db.server.js';

registerStep('price', {
  async execute(ctx) {
    const { pricingEnabled = true, surgeEnabled = true } = ctx.config;

    if (!pricingEnabled) {
      ctx.log('SYSTEM', 'Pricing disabled — skipping');
      return { data: {} };
    }

    const filtered = ctx.stepData.filteredProducts;
    if (!filtered?.length) return { data: {} };

    await ctx.setPhase(4, 'computing prices');
    const hasSerpApi = !!process.env.SERPAPI_KEY;
    ctx.log('PRICE', hasSerpApi
      ? 'Competitor-benchmarked dynamic pricing running…'
      : 'Dynamic pricing running (set SERPAPI_KEY for live competitor benchmarking)…',
    );

    for (const p of filtered) {
      let competitorIntel = null;

      if (hasSerpApi) {
        try {
          competitorIntel = await getCompetitorIntel(p.name, p.cat, p.cost);
        } catch { /* non-fatal */ }
      }

      const pricingResult = computePricingWithCompetitors(p, competitorIntel, { surgeEnabled });
      p.activePrice = pricingResult.mode;
      p.competitorPrice = pricingResult.price;

      const compNote = pricingResult.competitorAvg
        ? ` (comp avg $${pricingResult.competitorAvg.toFixed(2)})`
        : '';
      ctx.log('PRICE', `"${p.name}" → ${p.activePrice} $${pricingResult.price.toFixed(2)}${compNote}`, 'price');

      const dbProd = await prisma.engineProduct.findFirst({
        where: { engineRunId: ctx.runId, sourceId: p.id },
      });
      if (dbProd) {
        await prisma.engineProduct.update({
          where: { id: dbProd.id },
          data: {
            activePrice: p.activePrice,
            price: pricingResult.price,
          },
        });
      }
    }

    return { data: { filteredProducts: filtered } };
  },
});
