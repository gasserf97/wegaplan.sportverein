import type { MetadataRoute } from "next";
import { getPublicAppUrl } from "@/lib/stripe";

export default function manifest(): MetadataRoute.Manifest {
  const origin = getPublicAppUrl().replace(/\/$/, "");
  const manifestUrl = origin
    ? `${origin}/manifest.webmanifest`
    : "/manifest.webmanifest";

  return {
    name: "ASC Lajen",
    short_name: "ASC Lajen",
    description:
      "Kursanmeldungen für Mitglieder des ASC Lajen Raiffeisen – buchen und online bezahlen.",
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
