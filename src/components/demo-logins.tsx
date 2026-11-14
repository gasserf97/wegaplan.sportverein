import Link from "next/link";
import type { TFunction } from "@/lib/i18n/types";

const ACCOUNTS = [
  { roleKey: "home.demoAdmin", username: "admin", password: "Admin1234" },
  { roleKey: "home.demoMember", username: "max", password: "User1234" },
  { roleKey: "home.demoTennis", username: "tennis", password: "Tennis1234" },
  { roleKey: "home.demoFootball", username: "fussball", password: "Fussball1" },
  { roleKey: "home.demoFootballMember", username: "anna", password: "Anna1234" },
] as const;

export function DemoLogins({ t }: { t: TFunction }) {
  return (
    <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
      <h2 className="text-2xl text-primary">{t("home.demoHeading")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("home.demoIntro")}</p>
      <ul className="mt-4 divide-y divide-border">
        {ACCOUNTS.map((account) => (
          <li key={account.username} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3">
            <span className="text-sm font-medium">{t(account.roleKey)}</span>
            <span className="font-mono text-sm">
              {account.username}
              <span className="text-muted-foreground"> · {account.password}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("home.demoCard")}</p>
      <Link
        href="/anmelden"
        className="mt-4 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {t("home.demoLogin")}
      </Link>
    </section>
  );
}
