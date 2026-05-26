import { registerStep } from './index.js';
import { scoutProducts } from '../scout.js';

registerStep('scout', {
  async execute(ctx) {
    const { niche } = ctx.config;
    await ctx.setPhase(1, 'scanning sources…');
    ctx.log('SCOUT', `Niche: ${niche} — sourcing from CJ Dropshipping · AliExpress · Reddit · Google Trends`);

    const raw = await scoutProducts(niche, ctx.config, msg => ctx.log('SCOUT', msg));

    await ctx.setPhase(1, `found ${raw.length} candidates`);
    ctx.log('SCOUT', `${raw.length} raw candidates located`);

    if (!raw.length) throw new Error('No products found from any source');

    return { data: { scoutedProducts: raw } };
  },
});
