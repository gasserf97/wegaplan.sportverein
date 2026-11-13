import { redirect } from "next/navigation";

export default function LegacyMitarbeiterRedirect() {
  redirect("/admin/mitglieder");
}
