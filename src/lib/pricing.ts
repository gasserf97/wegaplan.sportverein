import { formatEuro } from "@/lib/format";

export const DEFAULT_CHILD_MAX_AGE = 18;

export type PriceBand = "adult" | "child";

export type PlanPriceInput = {
  priceCents: number;
  childPriceCents: number | null;
  childMaxAge: number;
  /** Leer = keine Altersgrenze. Zusammen mit fehlendem Erwachsenenpreis gilt der Kinderpreis für alle. */
  audienceMaxAge?: number | null;
  pricingMode?: "PER_PERSON" | "FAMILY_BUNDLE";
  familyPriceCents?: number | null;
  familyAdults?: number | null;
  familyChildren?: number | null;
};

export type CoursePriceInput = {
  priceCents: number;
  childPriceCents: number | null;
  childMaxAge: number;
  /** Leer = keine Altersgrenze. Zusammen mit fehlendem Erwachsenenpreis gilt der Kinderpreis für alle. */
  audienceMaxAge?: number | null;
};

export function isFamilyBundlePlan(plan: Pick<PlanPriceInput, "pricingMode">) {
  return plan.pricingMode === "FAMILY_BUNDLE";
}

export function familyBundleComposition(plan: PlanPriceInput) {
  return {
    adults: plan.familyAdults ?? 2,
    children: plan.familyChildren ?? 1,
    childMaxAge: plan.childMaxAge > 0 ? plan.childMaxAge : DEFAULT_CHILD_MAX_AGE,
  };
}

export function familyBundleLabel(plan: PlanPriceInput) {
  const { adults, children, childMaxAge } = familyBundleComposition(plan);
  const childWord = children === 1 ? "Kind" : "Kinder";
  return `${adults} Erwachsene + ${children} ${childWord} (unter ${childMaxAge} Jahre)`;
}

export function familyBundleRole(age: number, childMaxAge: number): "adult" | "child" {
  return age < childMaxAge ? "child" : "adult";
}

export function familyBundleRoleLabel(age: number, childMaxAge: number) {
  return familyBundleRole(age, childMaxAge) === "child" ? "Kind" : "Erwachsener";
}

export type FamilyBundleMember = {
  id: string;
  age: number;
};

export type FamilySelectionQuote = {
  totalCents: number;
  familyPacks: number;
  remainingAdults: number;
  remainingChildren: number;
  adultCount: number;
  childCount: number;
  adultPriceCents: number;
  childPriceCents: number;
  familyPriceCents: number | null;
  summary: string;
  /** paidCents per selected member id */
  paidByMemberId: Record<string, number>;
};

function buildQuoteSummary(quote: {
  familyPacks: number;
  remainingAdults: number;
  remainingChildren: number;
  familyPriceCents: number | null;
  adultPriceCents: number;
  childPriceCents: number;
}) {
  const parts: string[] = [];
  if (quote.familyPacks > 0 && quote.familyPriceCents != null) {
    parts.push(
      `${quote.familyPacks}× Familienkarte (${formatEuro(quote.familyPriceCents)})`,
    );
  }
  if (quote.remainingAdults > 0) {
    parts.push(
      `${quote.remainingAdults}× Erwachsene (${formatEuro(quote.adultPriceCents)})`,
    );
  }
  if (quote.remainingChildren > 0) {
    parts.push(
      `${quote.remainingChildren}× Kind (${formatEuro(quote.childPriceCents)})`,
    );
  }
  return parts.join(" + ") || "Keine Auswahl";
}

/**
 * Kombiniert Familienkarten (z. B. 2 Erwachsene + 1 Kind) mit Einzelpreisen.
 * Beispiel: 3 Erwachsene + 1 Kind → 1× Familienkarte + 1× Erwachsener.
 */
export function quoteFamilySelection(
  selected: FamilyBundleMember[],
  plan: PlanPriceInput,
): FamilySelectionQuote {
  const { adults: adultsPerPack, children: childrenPerPack, childMaxAge } =
    familyBundleComposition(plan);
  const adultPriceCents = plan.priceCents;
  const childPriceCents = plan.childPriceCents ?? plan.priceCents;
  const familyPriceCents = plan.familyPriceCents ?? null;

  const adults = selected.filter(
    (person) => familyBundleRole(person.age, childMaxAge) === "adult",
  );
  const children = selected.filter(
    (person) => familyBundleRole(person.age, childMaxAge) === "child",
  );

  let familyPacks = 0;
  if (
    isFamilyBundlePlan(plan) &&
    familyPriceCents != null &&
    adultsPerPack > 0 &&
    childrenPerPack > 0
  ) {
    const individualPackCost =
      adultsPerPack * adultPriceCents + childrenPerPack * childPriceCents;
    if (familyPriceCents <= individualPackCost) {
      familyPacks = Math.min(
        Math.floor(adults.length / adultsPerPack),
        Math.floor(children.length / childrenPerPack),
      );
    }
  }

  const remainingAdults = adults.length - familyPacks * adultsPerPack;
  const remainingChildren = children.length - familyPacks * childrenPerPack;
  const totalCents =
    familyPacks * (familyPriceCents ?? 0) +
    remainingAdults * adultPriceCents +
    remainingChildren * childPriceCents;

  const paidByMemberId: Record<string, number> = {};
  for (const person of selected) {
    paidByMemberId[person.id] = 0;
  }

  let adultIndex = 0;
  let childIndex = 0;
  for (let pack = 0; pack < familyPacks; pack++) {
    const packMembers: string[] = [];
    for (let i = 0; i < adultsPerPack; i++) {
      packMembers.push(adults[adultIndex++].id);
    }
    for (let i = 0; i < childrenPerPack; i++) {
      packMembers.push(children[childIndex++].id);
    }
    const packPrice = familyPriceCents ?? 0;
    const share = Math.floor(packPrice / packMembers.length);
    let assigned = 0;
    for (let i = 0; i < packMembers.length; i++) {
      const amount =
        i === packMembers.length - 1 ? packPrice - assigned : share;
      paidByMemberId[packMembers[i]] = amount;
      assigned += amount;
    }
  }

  while (adultIndex < adults.length) {
    paidByMemberId[adults[adultIndex++].id] = adultPriceCents;
  }
  while (childIndex < children.length) {
    paidByMemberId[children[childIndex++].id] = childPriceCents;
  }

  const quote = {
    totalCents,
    familyPacks,
    remainingAdults,
    remainingChildren,
    adultCount: adults.length,
    childCount: children.length,
    adultPriceCents,
    childPriceCents,
    familyPriceCents,
    summary: "",
    paidByMemberId,
  };
  quote.summary = buildQuoteSummary(quote);
  return quote;
}

export function ageFromBirthDate(birthDate: Date, on = new Date()) {
  let age = on.getFullYear() - birthDate.getFullYear();
  const monthDelta = on.getMonth() - birthDate.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return Math.max(0, age);
}

export function resolveAgeBasedPrice(
  item: CoursePriceInput,
  birthDate: Date | null,
) {
  const childMaxAge =
    item.childMaxAge > 0 ? item.childMaxAge : DEFAULT_CHILD_MAX_AGE;
  const hasChildPrice = item.childPriceCents != null;
  const age = birthDate ? ageFromBirthDate(birthDate) : null;

  if (hasChildPrice && childPriceAppliesToAllAges(item)) {
    return {
      cents: item.childPriceCents as number,
      band: "child" as PriceBand,
      age,
      childMaxAge,
      hasChildPrice,
    };
  }

  if (!hasChildPrice || age == null) {
    return {
      cents: item.priceCents,
      band: "adult" as PriceBand,
      age,
      childMaxAge,
      hasChildPrice,
    };
  }
  if (age < childMaxAge) {
    return {
      cents: item.childPriceCents as number,
      band: "child" as PriceBand,
      age,
      childMaxAge,
      hasChildPrice,
    };
  }

  return {
    cents: item.priceCents,
    band: "adult" as PriceBand,
    age,
    childMaxAge,
    hasChildPrice,
  };
}

export function resolvePlanPrice(plan: PlanPriceInput, birthDate: Date | null) {
  return resolveAgeBasedPrice(plan, birthDate);
}

export function resolveCoursePrice(
  course: CoursePriceInput,
  birthDate: Date | null,
) {
  return resolveAgeBasedPrice(course, birthDate);
}

/** Nur Kinderpreis hinterlegt (Erwachsenenfeld leer → 0). */
export function isChildOnlyListedPrice(item: {
  priceCents: number;
  childPriceCents: number | null;
}) {
  return item.childPriceCents != null && item.priceCents === 0;
}

/** Kinderpreis ohne Erwachsenentarif und ohne Höchstalter gilt für jedes Alter. */
export function childPriceAppliesToAllAges(item: {
  priceCents: number;
  childPriceCents: number | null;
  audienceMaxAge?: number | null;
}) {
  return isChildOnlyListedPrice(item) && item.audienceMaxAge == null;
}

function moneyLabel(cents: number, freeCapitalized = false) {
  if (cents === 0) return freeCapitalized ? "Kostenlos" : "kostenlos";
  return formatEuro(cents);
}

export function planPriceSummary(plan: PlanPriceInput) {
  if (isFamilyBundlePlan(plan) && plan.familyPriceCents != null) {
    const adult = moneyLabel(plan.priceCents);
    const child =
      plan.childPriceCents == null ? null : moneyLabel(plan.childPriceCents);
    const family = moneyLabel(plan.familyPriceCents);
    return child
      ? `Erwachsene ${adult} · Kinder ${child} · Familie ${family}`
      : `Erwachsene ${adult} · Familie ${family}`;
  }
  if (isChildOnlyListedPrice(plan)) {
    return moneyLabel(plan.childPriceCents as number, true);
  }
  if (plan.childPriceCents == null) {
    return moneyLabel(plan.priceCents, true);
  }
  return `Erwachsene ${moneyLabel(plan.priceCents)} · Kinder ${moneyLabel(plan.childPriceCents)}`;
}

export function coursePriceSummary(course: CoursePriceInput) {
  if (isChildOnlyListedPrice(course)) {
    return moneyLabel(course.childPriceCents as number, true);
  }
  if (course.childPriceCents == null) {
    return moneyLabel(course.priceCents, true);
  }
  return `Erwachsene ${moneyLabel(course.priceCents)} · Kinder ${moneyLabel(course.childPriceCents)}`;
}

export function planPriceHint(plan: PlanPriceInput, band?: PriceBand) {
  if (isFamilyBundlePlan(plan) && plan.familyPriceCents != null) {
    return `Familienkarte (${familyBundleLabel(plan)}) wird automatisch kombiniert, sobald die Auswahl passt.`;
  }
  if (plan.childPriceCents == null) return null;
  if (childPriceAppliesToAllAges(plan)) return null;
  const until = Math.max(0, plan.childMaxAge - 1);
  if (band === "child") {
    return `Kinderpreis (bis ${until} Jahre), ermittelt aus Ihrem Geburtsdatum.`;
  }
  if (band === "adult") {
    return `Erwachsenenpreis, ermittelt aus Ihrem Geburtsdatum (Kinder bis ${until} Jahre).`;
  }
  return `Kinderpreis gilt bis zum vollendeten ${plan.childMaxAge}. Lebensjahr.`;
}

export function coursePriceHint(course: CoursePriceInput, band?: PriceBand) {
  if (course.childPriceCents == null) return null;
  if (childPriceAppliesToAllAges(course)) return null;
  const until = Math.max(0, course.childMaxAge - 1);
  if (band === "child") {
    return `Kinderpreis (bis ${until} Jahre), ermittelt aus dem Geburtsdatum.`;
  }
  if (band === "adult") {
    return `Erwachsenenpreis, ermittelt aus dem Geburtsdatum (Kinder bis ${until} Jahre).`;
  }
  return `Kinderpreis gilt bis zum vollendeten ${course.childMaxAge}. Lebensjahr.`;
}

export function courseCardDisplay(course: CoursePriceInput) {
  if (isChildOnlyListedPrice(course)) {
    return {
      priceCents: course.childPriceCents as number,
      priceLabel: moneyLabel(course.childPriceCents as number, true),
      priceHint: undefined,
    };
  }

  const adultLabel = moneyLabel(course.priceCents, true);

  if (course.childPriceCents != null) {
    return {
      priceCents: course.priceCents,
      priceLabel: adultLabel,
      priceHint: `Erwachsenenpreis · Kinder ${moneyLabel(course.childPriceCents)}`,
    };
  }

  return {
    priceCents: course.priceCents,
    priceLabel: adultLabel,
    priceHint: undefined,
  };
}

export function planCardDisplay(plan: PlanPriceInput, _birthDate: Date | null = null) {
  if (isFamilyBundlePlan(plan) && plan.familyPriceCents != null) {
    const adultLabel = moneyLabel(plan.priceCents, true);
    const familyLabel = moneyLabel(plan.familyPriceCents);
    const childHint =
      plan.childPriceCents == null ? null : moneyLabel(plan.childPriceCents);
    return {
      priceCents: plan.priceCents,
      priceLabel: adultLabel,
      priceHint: childHint
        ? `Erwachsenenpreis · Kinder ${childHint} · Familie ${familyLabel}`
        : `Erwachsenenpreis · Familie ${familyLabel}`,
    };
  }

  if (isChildOnlyListedPrice(plan)) {
    return {
      priceCents: plan.childPriceCents as number,
      priceLabel: moneyLabel(plan.childPriceCents as number, true),
      priceHint: undefined,
    };
  }

  const adultLabel = moneyLabel(plan.priceCents, true);

  if (plan.childPriceCents != null) {
    return {
      priceCents: plan.priceCents,
      priceLabel: adultLabel,
      priceHint: `Erwachsenenpreis · Kinder ${moneyLabel(plan.childPriceCents)}`,
    };
  }

  return {
    priceCents: plan.priceCents,
    priceLabel: adultLabel,
    priceHint: undefined,
  };
}
