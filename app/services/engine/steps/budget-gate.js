import { registerStep } from './index.js';
import { checkBudget, flushCost, logCostSummary } from '../../ai/cost-tracker.js';
import { emit, Events } from '../../core/event-bus.js';
import { autoStopEngine } from '../risk-guard.js';

registerStep('budget_gate', {
  async execute(ctx) {
    ctx.log('COST', 'Checking AI budget…');

    const budgetCheck = await checkBudget(ctx.runId);
    await flushCost(ctx.runId);
    logCostSummary(ctx.runId, msg => ctx.log('COST', msg));

    if (!budgetCheck.ok) {
      ctx.log('COST', `AI budget exceeded: $${budgetCheck.spent.toFixed(4)} > $${budgetCheck.budget} — stopping`, 'warn');
      emit(Events.ENGINE_BUDGET_EXCEEDED, {
        runId: ctx.runId,
        shop: ctx.shop,
        spent: budgetCheck.spent,
        budget: budgetCheck.budget,
      });
      await autoStopEngine(ctx.shop, `AI budget exceeded ($${budgetCheck.spent.toFixed(4)} > $${budgetCheck.budget})`);
      throw new Error(`AI budget exceeded: $${budgetCheck.spent.toFixed(4)} > $${budgetCheck.budget}`);
    }

    ctx.log('COST', `Budget OK: $${budgetCheck.spent.toFixed(4)} / $${budgetCheck.budget}`);
    return { data: { budgetSnapshot: budgetCheck } };
  },
});
