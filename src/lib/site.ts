// Canonical site origin for metadata, robots.txt and the sitemaps (server-only).
// 1. NEXT_PUBLIC_SITE_URL: set this once the final/custom domain is known.
// 2. VERCEL_PROJECT_PRODUCTION_URL: Vercel's production domain (no scheme),
//    provided automatically on every Vercel build and function.
// 3. localhost for local development.
function resolveBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return "http://localhost:3000";
}

export const BASE_URL = resolveBaseUrl();
