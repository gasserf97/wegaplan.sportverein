"use client";

import { demoLoginAction } from "@/app/actions/auth";
import { useI18n } from "@/components/locale-provider";
import { rememberClientChannel } from "@/lib/client-channel";
import { DEMO_ACCOUNTS } from "@/lib/demo-accounts";
import { markPwaInstallPromptPending } from "@/lib/pwa-install";

export function DemoLogins({ nextPath = "/" }: { nextPath?: string }) {
  const { t } = useI18n();

  return (
    <section className="rounded-xl border border-border bg-white p-6 shadow-sm">
      <h2 className="text-2xl text-primary">{t("home.demoHeading")}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("home.demoIntro")}</p>
      <ul className="mt-4 divide-y divide-border">
        {DEMO_ACCOUNTS.map((account) => (
          <li key={account.username}>
            <form
              action={demoLoginAction}
              onSubmit={() => {
                rememberClientChannel();
                markPwaInstallPromptPending();
              }}
            >
              <input type="hidden" name="username" value={account.username} />
              <input type="hidden" name="next" value={nextPath} />
              <button
                type="submit"
                className="flex w-full flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3 text-left hover:text-primary"
              >
                <span className="text-sm font-medium">{t(account.roleKey)}</span>
                <span className="font-mono text-sm">
                  {account.username}
                  <span className="text-muted-foreground"> · {account.password}</span>
                </span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{t("home.demoCard")}</p>
    </section>
  );
}
