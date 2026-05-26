import { registerStep } from './index.js';
import { emit, Events } from '../../core/event-bus.js';
import prisma from '../../../db.server.js';

registerStep('score_filter', {
  async execute(ctx) {
    const {
      scoreThreshold = 65,
      marginFloor = 35,
      moqMax = 100,
    } = ctx.config;

    const raw = ctx.stepData.scoutedProducts;
    if (!raw?.length) throw new Error('No scouted products to score');

    await ctx.setPhase(2, 'scoring & filtering');
    ctx.log('SCOUT', `Margin floor: ${marginFloor}% · Score: ${scoreThreshold} · MOQ: ${moqMax}`);

    const filtered = raw
      .filter(p => p.score >= scoreThreshold && p.margin >= marginFloor && p.moq <= moqMax)
      .sort((a, b) => b.score - a.score);

    await ctx.setPhase(2, `${filtered.length}/${raw.length} passed`);
    ctx.log('SCOUT', `${filtered.length} products passed scoring`);

    emit(Events.ENGINE_PRODUCTS_SCORED, {
      runId: ctx.runId, shop: ctx.shop, passed: filtered.length, total: raw.length,
    });

    await persistProducts(ctx.runId, ctx.shop, filtered);
    await ctx.flushLogs();

    return { data: { filteredProducts: filtered } };
  },
});

async function persistProducts(runId, shop, products) {
  for (const p of products) {
    try {
      await prisma.engineProduct.upsert({
        where: { engineRunId_sourceId: { engineRunId: runId, sourceId: p.id } },
        update: {
          score: p.score,
          margin: p.margin,
          discount: p.discount ?? 0,
          landedCost: p.landed ?? 0,
          moq: p.moq ?? 0,
          activePrice: p.activePrice || 'standard',
          aiNegotiated: p.aiPowered || false,
        },
        create: {
          engineRunId: runId,
          shop,
          sourceId: p.id,
          name: p.name,
          category: p.cat || '',
          score: p.score,
          margin: p.margin,
          price: p.price ?? 0,
          cost: p.cost ?? 0,
          landedCost: p.landed ?? 0,
          velocity: p.velocity ?? 0,
          trend: p.trend ?? 0,
          lifecycle: p.lifecycle || 'mature',
          competition: p.competition || 'medium',
          supplier: p.supplier || '',
          supplierScore: p.supScore ?? 0,
          moq: p.moq ?? 0,
          discount: p.discount ?? 0,
          sources: JSON.stringify(p.sources || []),
          searches: p.searches ?? 0,
          impulse: p.impulse ?? 0,
          warnings: JSON.stringify(p.warns || []),
          negState: p.negState ?? 0,
          activePrice: p.activePrice || 'standard',
          aiNegotiated: p.aiPowered || false,
          seoTitle: p.seoTitle || null,
          brandKeywords: JSON.stringify(p.brandKeywords || []),
          aliProductId: p.aliProductId || p._productId || null,
        },
      });
    } catch (err) {
      console.error('[engine] persist failed:', p.id, err.message);
    }
  }
}
