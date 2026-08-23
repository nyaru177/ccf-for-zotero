function pickYear(value: string): string | undefined {
  return value.match(/\b(20\d{2})\b/)?.[1];
}

function includesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

function findingsAlias(value: string): string | undefined {
  if (!/findings of (the )?association for computational linguistics/i.test(value)) {
    return undefined;
  }

  const year = pickYear(value);
  const normalized = value.toUpperCase();
  const events = ["ACL", "EMNLP", "NAACL", "EACL", "COLING"];
  const event = events.find((candidate) =>
    new RegExp(`\\b${candidate}\\b`, "i").test(normalized),
  );

  return event ? `Findings ${event}${year ? ` ${year}` : ""}` : "Findings ACL";
}

const aliasRules: Array<{ alias: string; patterns: RegExp[] }> = [
  {
    alias: "KDD Explorations",
    patterns: [/acm sigkdd explorations newsletter/i],
  },
  {
    alias: "AI Review",
    patterns: [/^artificial intelligence review$/i],
  },
  {
    alias: "EACL",
    patterns: [
      /^eacl\b/i,
      /european chapter of (the )?association for computational linguistics/i,
      /conf\.?\s+eur\.?\s+chapter.*comput\.?\s+linguist/i,
    ],
  },
  {
    alias: "FEVER",
    patterns: [/fact extraction verification workshop/i, /^fever\b/i],
  },
  {
    alias: "Frontiers AI",
    patterns: [/^frontiers in artificial intelligence$/i],
  },
  {
    alias: "IJMIR",
    patterns: [/international journal of multimedia information retrieval/i],
  },
  {
    alias: "JMIR",
    patterns: [/^journal of medical internet research$/i],
  },
  {
    alias: "Lang. Linguist. Compass",
    patterns: [/language and linguistics compass/i],
  },
  {
    alias: "LNCS",
    patterns: [/lecture notes in computer science/i, /lect\.?\s+notes comput\.?\s+sci/i],
  },
  {
    alias: "NLP Research",
    patterns: [/^natural language processing research$/i],
  },
  {
    alias: "Nat. Mach. Intell.",
    patterns: [/^nature machine intelligence$/i],
  },
  {
    alias: "MM-AI Workshop",
    patterns: [/acm international workshop on multimedia ai/i],
  },
  {
    alias: "SNAM",
    patterns: [/^social network analysis and mining$/i],
  },
  {
    alias: "IEEE Access",
    patterns: [/^ieee access$/i],
  },
];

export function formatNonCcfVenueText(value?: string): string {
  const original = value?.replace(/\s+/g, " ").trim();
  if (!original) return "Venue";

  const findings = findingsAlias(original);
  if (findings) return findings;

  const matched = aliasRules.find((rule) => includesAny(original, rule.patterns));
  return matched?.alias || original;
}
