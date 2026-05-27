import { registerStep } from './index.js';
import { enrichWithBrandResearch } from '../../intelligence/brand-research.js';
import prisma from '../../../db.server.js';

registerStep('brand_research', {
  async execute(ctx) {
    const { niche } = ctx.config;
    const raw = ctx.stepData.scoutedProducts;
    if (!raw?.length) return { data: {} };

    if (ctx.config.brandResearch === false) {
      ctx.log('BRAND', 'Brand research disabled — skipping');
      return { data: { brandKeywords: [], brandInsights: {} } };
    }

    ctx.log('BRAND', 'Running ADK brand research (keyword + title + insights)…');

    const { keywords, insights, enrichedProducts } = await enrichWithBrandResearch(
      niche, raw, msg => ctx.log('BRAND', msg),
    );

    if (keywords.length || Object.keys(insights).length) {
      await prisma.engineRun.update({
        where: { id: ctx.runId },
        data: { brandResearch: JSON.stringify({ keywords, insights }) },
      }).catch(() => {});
    }

    ctx.log('BRAND', `${keywords.length} keywords, ${Object.keys(insights).length} insight categories`);

    return {
      data: {
        scoutedProducts: enrichedProducts,
        brandKeywords: keywords,
        brandInsights: insights,
      },
    };
  },
});
