import { redirect } from "next/navigation";

export default async function RegisterConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const nextPath = next?.startsWith("/") && !next.startsWith("//") ? next : "/konto";
  redirect(nextPath);
}
