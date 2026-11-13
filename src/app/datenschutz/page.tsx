import type { Metadata } from "next";
import { getPrivacyContent } from "@/lib/privacy-content";
import { getServerI18n } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getServerI18n();
  const content = getPrivacyContent(locale);
  return {
    title: content.title,
    description: content.intro[0],
  };
}

export default async function PrivacyPage() {
  const { locale } = await getServerI18n();
  const content = getPrivacyContent(locale);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
        {content.updatedLabel}: {content.updatedAt}
      </p>
      <h1 className="mt-2 text-4xl text-primary sm:text-5xl">{content.title}</h1>

      <div className="mt-6 space-y-4 text-base leading-7 text-muted-foreground">
        {content.intro.map((paragraph) => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}
      </div>

      <div className="mt-10 space-y-10">
        {content.sections.map((section) => (
          <section key={section.heading} className="space-y-3">
            <h2 className="font-heading text-xl text-foreground sm:text-2xl">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p
                key={paragraph.slice(0, 48)}
                className="text-sm leading-7 text-muted-foreground sm:text-base"
              >
                {paragraph}
              </p>
            ))}
            {section.bullets && section.bullets.length > 0 ? (
              <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground sm:text-base">
                {section.bullets.map((item) => (
                  <li key={item.slice(0, 64)}>{item}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
    </div>
  );
}
