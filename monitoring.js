// Production-only Vercel monitoring: Web Analytics (page views, visitors) and
// Speed Insights (Core Web Vitals field data from real browsers).
//
// Both scripts are served same-origin from /_vercel/* on Vercel, so they satisfy
// the strict CSP in vercel.json (script-src 'self', connect-src 'self'). Neither
// adds an inline script or a third-party origin. Both packages are only active
// once the features are enabled for the project in the Vercel dashboard; see
// README "Analytics and performance monitoring".
//
// Injection is skipped in development (`vite dev`) so local work does not send
// data to Vercel or try to load the debug scripts from another origin.
import { inject } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';

export function startMonitoring() {
  if (!import.meta.env.PROD) return false;
  inject();
  injectSpeedInsights();
  return true;
}

startMonitoring();
