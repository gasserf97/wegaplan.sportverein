import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Feste Pfade, damit Next.js beim Build nur diese Dateien traced
 * (kein dynamisches path.join(cwd, filename)).
 */
export async function readPublicAsset(
  filename: "asc-logo-icon.png" | "asc-stamp-signature.jpg",
) {
  try {
    switch (filename) {
      case "asc-logo-icon.png":
        return await fs.readFile(
          path.join(process.cwd(), "public/asc-logo-icon.png"),
        );
      case "asc-stamp-signature.jpg":
        return await fs.readFile(
          path.join(process.cwd(), "public/asc-stamp-signature.jpg"),
        );
    }
  } catch {
    return null;
  }
}
