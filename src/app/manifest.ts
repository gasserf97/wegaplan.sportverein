import type { MetadataRoute } from "next";
import { clubDisplayName } from "@/lib/club-settings";
import { getAppUrl } from "@/lib/stripe";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const origin = (await getAppUrl()).replace(/\/$/, "");
  const name = await clubDisplayName();
  const manifestUrl = origin
    ? `${origin}/manifest.webmanifest`
    : "/manifest.webmanifest";

  return {
    name,
    short_name: name,
    description: `${name} – Kurse, Mitgliedschaften und Buchungen.`,
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    background_color: "#f8f8f8",
    theme_color: "#e40000",
    lang: "de",
    // Absolute Manifest-URL: getInstalledRelatedApps() erkennt die installierte PWA.
    related_applications: [
      {
        platform: "webapp",
        url: manifestUrl,
      },
    ],
    prefer_related_applications: false,
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
