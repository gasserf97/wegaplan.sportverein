export const COURSE_ACCENTS = {
  red: {
    label: "Rot",
    className: "from-[#a30000] via-[#e40000] to-[#ff4d4d]",
    borderClass: "border-[#e40000]/45",
  },
  green: {
    label: "Grün",
    className: "from-[#155c09] via-[#228212] to-[#4AAE48]",
    borderClass: "border-[#228212]/45",
  },
  teal: {
    label: "Türkis",
    className: "from-[#005768] via-[#007c94] to-[#2bc3d2]",
    borderClass: "border-[#007c94]/45",
  },
  navy: {
    label: "Dunkelblau",
    className: "from-[#0f2238] via-[#1B365D] to-[#3d5a80]",
    borderClass: "border-[#1B365D]/45",
  },
  yellow: {
    label: "Gelb",
    className: "from-[#a67c00] via-[#d4a017] to-[#f0c84a]",
    borderClass: "border-[#d4a017]/50",
  },
  dark: {
    label: "Anthrazit",
    className: "from-[#0a0a0a] via-[#151515] to-[#3d3d3d]",
    borderClass: "border-[#151515]/40",
  },
} as const;

export type CourseAccent = keyof typeof COURSE_ACCENTS;

export function getAccent(value: string) {
  return COURSE_ACCENTS[value as CourseAccent] ?? COURSE_ACCENTS.red;
}

/** Legacy accent keys from seed data → ASC palette */
const LEGACY_ACCENTS: Record<string, CourseAccent> = {
  rust: "red",
  olive: "green",
  ink: "navy",
  clay: "teal",
  gold: "yellow",
};

export function resolveAccent(value: string) {
  return LEGACY_ACCENTS[value] ?? (value in COURSE_ACCENTS ? value : "red");
}
