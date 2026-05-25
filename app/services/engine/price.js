export function computePricing(product, opts = {}) {
  const surgeSwitchOn = opts.surgeEnabled !== false;

  if (product.lifecycle === 'viral' && product.trend > 15 && surgeSwitchOn) {
    return 'surge';
  }
  if (product.lifecycle === 'dying') {
    return 'undercut';
  }
  if (product.competition === 'high') {
    return 'undercut';
  }
  if (product.lifecycle === 'mature' || product.impulse < 70) {
    return 'psych';
  }
  return 'psych';
}

export function getActivePrice(product) {
  switch (product.activePrice) {
    case 'surge':    return parseFloat((product.price * 1.12).toFixed(2));
    case 'undercut': return parseFloat((product.price * 0.96).toFixed(2));
    case 'psych':    return parseFloat((Math.floor(product.price) - 0.01).toFixed(2));
    default:         return product.price;
  }
}
