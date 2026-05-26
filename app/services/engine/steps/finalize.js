import { registerStep } from './index.js';
import { checkBudget, flushCost, logCostSummary, clearRunAccumulator } from '../../ai/cost-tracker.js';
import { allBreakerStatus } from '../../circuit-breaker.js';
import prisma from '../../../db.server.js';

registerStep('finalize', {
  async execute(ctx) {
    const filtered = ctx.stepData.filteredProducts || [];

    await ctx.setPhase(6, `${filtered.length} products ready`);

    const finalBudget = await checkBudget(ctx.runId);
    await flushCost(ctx.runId);
    logCostSummary(ctx.runId, msg => ctx.log('COST', msg));
    clearRunAccumulator(ctx.runId);

    const cbStatus = allBreakerStatus().filter(b => b.state !== 'CLOSED');
    if (cbStatus.length) {
      ctx.log('SYSTEM', `Circuit breakers: ${cbStatus.map(b => `${b.name}=${b.state}`).join(', ')}`);
    }

    ctx.log('SYSTEM', `Pipeline complete. ${filtered.length} products live. AI spend: $${finalBudget.spent.toFixed(4)}`);

    const avgMargin = filtered.length
      ? Math.round(filtered.reduce((a, p) => a + (p.margin || 0), 0) / filtered.length)
      : 0;

    await prisma.engineRun.update({
      where: { id: ctx.runId },
      data: {
        sessionRev: Math.round(
          filtered.reduce((a, p) => a + (p.velocity || 0) * (p.price || 0), 0),
        ),
      },
    }).catch(() => {});

    return {
      data: {
        stats: {
          products: filtered.length,
          avgMargin,
          dealsClosed: filtered.filter(p => p.negState === 5).length,
          aiSpend: finalBudget.spent,
        },
      },
    };
  },
});
