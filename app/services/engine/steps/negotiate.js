import { registerStep } from './index.js';
import { negotiateSupplier, algorithmicNegotiate } from '../negotiate.js';
import prisma from '../../../db.server.js';

registerStep('negotiate', {
  async execute(ctx) {
    const {
      negotiationEnabled = true,
      autonomyLevel = 3,
    } = ctx.config;

    if (!negotiationEnabled) {
      ctx.log('SYSTEM', 'Negotiation disabled — skipping');
      return { data: {} };
    }

    const filtered = ctx.stepData.filteredProducts;
    if (!filtered?.length) return { data: {} };

    await ctx.setPhase(3, `negotiating ${filtered.length} suppliers`);

    const aiTierCount = Math.min(8, Math.max(1, Math.round(filtered.length * 0.10)));
    ctx.log('NEGOTIATE', `AI-negotiate top ${aiTierCount}/${filtered.length} — rest use algorithmic`);

    let dealsClosed = 0;

    for (let i = 0; i < filtered.length; i++) {
      const p = filtered[i];
      if (await ctx.isStopped()) break;

      if (i % 10 === 0 && i > 0) await ctx.renewLock();

      const useAI = i < aiTierCount;
      await ctx.setPhase(3, p.supplier);

      let deal;
      if (useAI) {
        ctx.log('NEGOTIATE', `[AI] Outreach → ${p.supplier} for "${p.name}"`);
        deal = await negotiateSupplier(p);
      } else {
        deal = algorithmicNegotiate(p);
        ctx.log('NEGOTIATE', `[algo] ${p.supplier} — ${deal.discount}% off`, 'negotiate');
      }

      p.negState = 5;
      p.discount = deal.discount;
      p.landed = deal.landed;
      p.margin = deal.margin;
      if (deal.moq) p.moq = deal.moq;
      p.aiPowered = deal.aiPowered;
      dealsClosed++;

      if (useAI) {
        const badge = deal.aiPowered ? ' [AI]' : ' [fallback]';
        ctx.log('NEGOTIATE', `Deal closed${badge}: ${p.supplier} — ${p.discount}% off, MOQ ${p.moq}`, 'negotiate');
      }

      const dbProd = await prisma.engineProduct.findFirst({
        where: { engineRunId: ctx.runId, sourceId: p.id },
      });
      if (dbProd) {
        const finalMoq = deal.moq || dbProd.moq;
        await prisma.engineProduct.update({
          where: { id: dbProd.id },
          data: {
            discount: deal.discount,
            landedCost: deal.landed,
            margin: deal.margin,
            moq: finalMoq,
            negState: 5,
            aiNegotiated: deal.aiPowered || false,
            discountImproved: Math.max(0, deal.discount - dbProd.discount),
            moqImproved: Math.max(0, dbProd.moq - finalMoq),
          },
        });
      }

      await sleep(useAI && autonomyLevel >= 4 ? 400 : 150);
    }

    await prisma.engineRun.update({
      where: { id: ctx.runId },
      data: { dealsClosed },
    }).catch(() => {});

    return { data: { filteredProducts: filtered } };
  },
});

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
