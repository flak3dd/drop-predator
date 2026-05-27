import { registerStep } from './index.js';
import { runRiskChecks, autoStopEngine } from '../../risk/risk-guard.js';

registerStep('risk_check', {
  async execute(ctx) {
    ctx.log('RISK', 'Running pre-flight risk checks…');

    const report = await runRiskChecks(ctx.shop, ctx.config._admin || null);

    if (report.warnings.length) {
      for (const w of report.warnings) ctx.log('RISK', w, 'warn');
    }

    if (!report.ok) {
      for (const b of report.blockers) ctx.log('RISK', `BLOCKED: ${b}`, 'warn');
      await autoStopEngine(ctx.shop, report.blockers[0]);
      throw new Error(`Risk blocked: ${report.blockers[0]}`);
    }

    ctx.log('RISK', `Passed — ${report.warnings.length} warning(s)`);
    return { data: { riskReport: { ok: true, warnings: report.warnings } } };
  },
});
