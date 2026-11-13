import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  buildMembersExportWorkbook,
  XLSX_CONTENT_TYPE,
} from "@/lib/members-export";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Nicht berechtigt." }, { status: 401 });
  }

  const { buffer, filename } = await buildMembersExportWorkbook();

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
