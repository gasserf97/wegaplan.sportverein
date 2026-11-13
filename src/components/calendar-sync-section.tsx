"use client";

import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  rotateCalendarFeedTokenAction,
  setCalendarSyncChoiceAction,
  setCalendarSyncEnabledAction,
} from "@/app/actions/calendar-sync";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/locale-provider";
import {
  GOOGLE_CALENDAR_ADDBYURL,
  googleCalendarAddByUrlChromeIntent,
} from "@/lib/google-calendar-intent";

type CalendarDevice = "android" | "ios" | "other";

function subscribeNoop() {
  return () => {};
}

function detectCalendarDevice(): CalendarDevice {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  return "other";
}

const GOOGLE_GUIDE_STEPS: Record<CalendarDevice, string[]> = {
  android: [
    "account.calendarGoogleAndroidStep1",
    "account.calendarGoogleAndroidStep2",
    "account.calendarGoogleAndroidStep3",
    "account.calendarGoogleAndroidStep4",
    "account.calendarGoogleAndroidStep5",
    "account.calendarGoogleAndroidStep6",
    "account.calendarGoogleAndroidStep7",
    "account.calendarGoogleAndroidStep8",
  ],
  ios: [
    "account.calendarGoogleIosStep1",
    "account.calendarGoogleIosStep2",
    "account.calendarGoogleIosStep3",
    "account.calendarGoogleIosStep4",
  ],
  other: [
    "account.calendarGoogleDesktopStep1",
    "account.calendarGoogleDesktopStep2",
    "account.calendarGoogleDesktopStep3",
  ],
};

export function CalendarSyncSection({
  enabled,
  tennis,
  courses,
  childCourses,
  hasChild,
  httpsUrl,
  webcalUrl,
  googleUrl,
}: {
  enabled: boolean;
  tennis: boolean;
  courses: boolean;
  childCourses: boolean;
  hasChild: boolean;
  httpsUrl: string | null;
  webcalUrl: string | null;
  googleUrl: string | null;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(enabled);
  const [tennisOn, setTennisOn] = useState(tennis);
  const [coursesOn, setCoursesOn] = useState(courses);
  const [childCoursesOn, setChildCoursesOn] = useState(childCourses);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [googleHref, setGoogleHref] = useState(googleUrl ?? "");
  const [guideOpen, setGuideOpen] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(false);
  const device = useSyncExternalStore(
    subscribeNoop,
    detectCalendarDevice,
    () => "other" as CalendarDevice,
  );

  useEffect(() => {
    if (!googleUrl) return;
    const android = /Android/i.test(navigator.userAgent);
    // Android: „Per URL“ in Chrome (cid landet in der Kalender-App und scheitert).
    setGoogleHref(android ? googleCalendarAddByUrlChromeIntent() : googleUrl);
  }, [googleUrl]);

  useEffect(() => {
    function openFromHash() {
      if (window.location.hash.replace(/^#/, "") !== "kalender") return;
      setSectionOpen(true);
      window.requestAnimationFrame(() => {
        document.getElementById("kalender")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    }
    openFromHash();
    window.addEventListener("hashchange", openFromHash);
    return () => window.removeEventListener("hashchange", openFromHash);
  }, []);

  function toggle(next: boolean) {
    setError(null);
    setOn(next);
    start(async () => {
      const result = await setCalendarSyncEnabledAction(next);
      if (result && "error" in result && result.error) {
        setOn(!next);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function toggleChoice(
    choice: "tennis" | "courses" | "childCourses",
    next: boolean,
  ) {
    const previous =
      choice === "tennis" ? tennisOn : choice === "courses" ? coursesOn : childCoursesOn;
    const setChecked =
      choice === "tennis"
        ? setTennisOn
        : choice === "courses"
          ? setCoursesOn
          : setChildCoursesOn;
    setError(null);
    setChecked(next);
    start(async () => {
      const result = await setCalendarSyncChoiceAction(choice, next);
      if (result && "error" in result && result.error) {
        setChecked(previous);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function rotate() {
    if (!window.confirm(t("account.calendarRotateHint"))) return;
    setError(null);
    start(async () => {
      const result = await rotateCalendarFeedTokenAction();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  async function copyLink() {
    if (!httpsUrl) return;
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("account.calendarCopyFailed"));
    }
  }

  /** Android (getestet): Feed kopieren + Chrome „Per URL“. */
  async function openGoogleOnAndroid() {
    if (!httpsUrl) return;
    setError(null);
    try {
      await navigator.clipboard.writeText(httpsUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(t("account.calendarCopyFailed"));
    }
    window.location.assign(googleCalendarAddByUrlChromeIntent());
  }

  const guideSteps = GOOGLE_GUIDE_STEPS[device];
  const isAndroid = device === "android";

  return (
    <details
      id="kalender"
      open={sectionOpen}
      onToggle={(event) => setSectionOpen(event.currentTarget.open)}
      className="group min-w-0 max-w-full scroll-mt-24 rounded-xl border border-border bg-card"
    >
      <summary className="flex w-full min-w-0 cursor-pointer list-none items-start justify-between gap-3 p-4 marker:content-none sm:p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">{t("account.calendarTitle")}</p>
          <p className="mt-1 text-sm break-words text-muted-foreground">{t("account.calendarHint")}</p>
        </div>
        <span
          aria-hidden
          className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="border-t border-border px-4 pt-4 pb-4 sm:px-5 sm:pb-5">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={on}
            disabled={pending}
            onChange={(event) => toggle(event.target.checked)}
          />
          {t("account.calendarEnable")}
        </label>

        {on ? (
          <div className="mt-4 grid gap-2">
            <p className="text-sm text-muted-foreground">{t("account.calendarChoicesHint")}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={tennisOn}
                disabled={pending}
                onChange={(event) => toggleChoice("tennis", event.target.checked)}
              />
              {t("account.calendarChoiceTennis")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={coursesOn}
                disabled={pending}
                onChange={(event) => toggleChoice("courses", event.target.checked)}
              />
              {t("account.calendarChoiceCourses")}
            </label>
            {hasChild ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={childCoursesOn}
                  disabled={pending}
                  onChange={(event) => toggleChoice("childCourses", event.target.checked)}
                />
                {t("account.calendarChoiceChildCourses")}
              </label>
            ) : null}
          </div>
        ) : null}

        {on && httpsUrl && webcalUrl && googleUrl ? (
          <div className="mt-4 grid gap-3">
            <p className="text-sm text-muted-foreground">
              {isAndroid
                ? t("account.calendarGoogleAndroidHint")
                : t("account.calendarSubscribeHint")}
            </p>
            <div className="flex flex-wrap gap-2">
              {!isAndroid ? (
                <Button nativeButton={false} render={<a href={webcalUrl} />}>
                  {t("account.calendarIphone")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                disabled={pending || !googleHref}
                onClick={() => setGuideOpen(true)}
              >
                {t("account.calendarGoogle")}
              </Button>
              <Button type="button" variant="outline" disabled={pending} onClick={() => void copyLink()}>
                {copied ? t("account.calendarCopied") : t("account.calendarCopy")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("account.calendarManualHint")}</p>
            <p className="break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs">
              {httpsUrl}
            </p>
            <p className="text-xs text-muted-foreground">{t("account.calendarPersonal")}</p>
            <div>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={rotate}>
                {t("account.calendarRotate")}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 text-sm text-destructive">{error}</p>
        ) : null}
      </div>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("account.calendarGoogleGuideTitle")}</DialogTitle>
            <DialogDescription>
              {t(
                isAndroid
                  ? "account.calendarGoogleAndroidGuideIntro"
                  : "account.calendarGoogleGuideIntro",
              )}
            </DialogDescription>
          </DialogHeader>
          <ol className="grid gap-3">
            {guideSteps.map((key, index) => (
              <li key={key} className="flex gap-3 text-sm leading-snug">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <span className="pt-1 text-foreground">{t(key)}</span>
              </li>
            ))}
          </ol>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => setGuideOpen(false)}>
              {t("account.calendarGoogleGuideLater")}
            </Button>
            {isAndroid ? (
              <Button
                type="button"
                disabled={pending || !httpsUrl}
                onClick={() => {
                  setGuideOpen(false);
                  void openGoogleOnAndroid();
                }}
              >
                {copied
                  ? t("account.calendarGoogleCopied")
                  : t("account.calendarGoogleGuideOpen")}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => {
                  setGuideOpen(false);
                  if (!googleHref && !googleUrl) return;
                  window.open(
                    googleHref || googleUrl || GOOGLE_CALENDAR_ADDBYURL,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }}
              >
                {t("account.calendarGoogleGuideOpen")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </details>
  );
}
