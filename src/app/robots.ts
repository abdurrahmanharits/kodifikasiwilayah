import type { MetadataRoute } from "next";
import { BASE_URL } from "@/lib/site";
import { generateSitemaps } from "./sitemap";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const sitemaps = await generateSitemaps();

  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: sitemaps.map((s) => `${BASE_URL}/sitemap/${s.id}.xml`),
  };
}
