import { redirect } from "next/navigation";
import { normalizeVerifyToken } from "@/lib/email-verification";

export const dynamic = "force-dynamic";

/** Alte Pfad-Links /bestaetigen/<token> auf Query-Form umleiten. */
export default async function ConfirmEmailPathAliasPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { token: raw } = await params;
  const { next } = await searchParams;
  const token = normalizeVerifyToken(raw);
  if (!token) {
    redirect("/registrieren");
  }
  const qs = new URLSearchParams();
  qs.set("token", token);
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    qs.set("next", next);
  }
  redirect(`/bestaetigen?${qs.toString()}`);
}
