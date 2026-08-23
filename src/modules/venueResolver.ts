import { CCFKind, VenueCandidate, VenueResolution } from "./types";

function getField(item: Zotero.Item, field: string): string {
  try {
    const value = item.getField(field);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function addCandidate(
  candidates: VenueCandidate[],
  value: string,
  field: string,
  kindHint?: CCFKind,
  context?: string,
) {
  const trimmed = value.trim();
  if (!trimmed) return;
  if (
    candidates.some(
      (candidate) => candidate.value === trimmed && candidate.field === field,
    )
  ) {
    return;
  }
  candidates.push({ value: trimmed, field, kindHint, context });
}

function hasWorkshopMarker(value: string): boolean {
  return /\bworkshops?\b/i.test(value) || /\bCVPR\d{4}W\b/i.test(value);
}

function extractBracketAbbr(value: string): string[] {
  const matches = [...value.matchAll(/\(([A-Za-z][A-Za-z0-9+/-]{1,})\)/g)];
  return matches.map((match) => match[1]);
}

function extractTrailingAbbr(value: string): string[] {
  const matches = [
    ...value.matchAll(/,\s*([A-Za-z][A-Za-z0-9+/-]{1,})\s*$/g),
  ];
  return matches.map((match) => match[1]);
}

function addVenueField(
  candidates: VenueCandidate[],
  value: string,
  field: string,
  kindHint?: CCFKind,
) {
  const trimmed = value.trim();
  if (!trimmed) return;

  if (!hasWorkshopMarker(trimmed)) {
    for (const abbr of [
      ...extractBracketAbbr(trimmed),
      ...extractTrailingAbbr(trimmed),
    ]) {
      addCandidate(candidates, abbr, `${field}:abbr`, kindHint, trimmed);
    }
  }

  addCandidate(candidates, trimmed, field, kindHint);
}

function extractExtraVenues(extra: string): string[] {
  const venues: string[] = [];
  const pattern =
    /^\s*(venue|conference|journal|booktitle|proceedings|publication)\s*[:=]\s*(.+)$/i;
  for (const line of extra.split(/\r?\n/)) {
    const match = line.match(pattern);
    if (match?.[2]) venues.push(match[2]);
  }
  return venues;
}

function isPreprint(item: Zotero.Item): boolean {
  const fields = [
    "archiveID",
    "repository",
    "libraryCatalog",
    "DOI",
    "url",
    "extra",
  ];
  return fields.some((field) =>
    getField(item, field).toLowerCase().includes("arxiv"),
  );
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function extractDoiVenuePrefix(value: string): string[] {
  const matches = [
    ...value.matchAll(/\b10\.1109\/([A-Za-z][A-Za-z0-9+_-]*)/gi),
  ];
  return matches
    .map((match) => match[1].replace(/[0-9].*$/, "").toUpperCase())
    .filter((prefix) => prefix.length >= 3);
}

function extractAclAnthologyHints(value: string): string[] {
  const hints: string[] = [];
  const matches = [
    ...value.matchAll(
      /\b(?:10\.18653\/v1\/)?(20\d{2})\.([a-z]+(?:-[a-z]+)*)\.\d+\b/gi,
    ),
  ];

  for (const match of matches) {
    const year = match[1];
    const code = match[2].toLowerCase();
    const findings = code.match(/^findings-(acl|emnlp|naacl|eacl|coling)$/);
    if (findings?.[1]) {
      hints.push(
        `Findings of the Association for Computational Linguistics: ${findings[1].toUpperCase()} ${year}`,
      );
      continue;
    }

    if (/^acl-(long|short|main)$/.test(code)) {
      hints.push("ACL");
    } else if (code === "emnlp-main") {
      hints.push("EMNLP");
    } else if (/^naacl-(long|short|main)$/.test(code)) {
      hints.push("NAACL");
    } else if (code === "coling-main") {
      hints.push("COLING");
    } else if (/^eacl-(long|short|main)$/.test(code)) {
      hints.push("EACL");
    }
  }

  return unique(hints);
}

function getVenueContext(item: Zotero.Item): string {
  return [
    "conferenceName",
    "proceedingsTitle",
    "publicationTitle",
    "journalAbbreviation",
    "seriesTitle",
    "extra",
  ]
    .map((field) => getField(item, field))
    .filter(Boolean)
    .join(" ");
}

function addIdentifierHints(candidates: VenueCandidate[], item: Zotero.Item) {
  const identifierText = ["DOI", "url", "extra"]
    .map((field) => getField(item, field))
    .join(" ");
  const normalizedIdentifierText = identifierText.toLowerCase();
  const venueContext = getVenueContext(item);

  for (const hint of extractAclAnthologyHints(normalizedIdentifierText)) {
    addCandidate(candidates, hint, "identifier:acl-anthology", "conference");
  }

  if (/cvpr\d{4}w\b|_cvprw_\d{4}_paper/.test(normalizedIdentifierText)) {
    addCandidate(candidates, "CVPR Workshops", "identifier", "conference");
  } else if (
    /cvpr\d{4}\/html|_cvpr_\d{4}_paper/.test(normalizedIdentifierText)
  ) {
    addCandidate(candidates, "CVPR", "identifier", "conference", venueContext);
  }

  for (const prefix of extractDoiVenuePrefix(identifierText)) {
    addCandidate(candidates, prefix, "identifier:doi-prefix");
  }
}

export function resolveVenueCandidates(item: Zotero.Item): VenueResolution {
  const candidates: VenueCandidate[] = [];
  const itemType = item.itemType;

  if (itemType === "conferencePaper") {
    addVenueField(
      candidates,
      getField(item, "proceedingsTitle"),
      "proceedingsTitle",
      "conference",
    );
    addVenueField(
      candidates,
      getField(item, "conferenceName"),
      "conferenceName",
      "conference",
    );
    addVenueField(
      candidates,
      getField(item, "publicationTitle"),
      "publicationTitle",
      "conference",
    );
    addVenueField(
      candidates,
      getField(item, "seriesTitle"),
      "seriesTitle",
      "conference",
    );
  } else if (itemType === "journalArticle") {
    addVenueField(
      candidates,
      getField(item, "publicationTitle"),
      "publicationTitle",
      "journal",
    );
    addVenueField(
      candidates,
      getField(item, "journalAbbreviation"),
      "journalAbbreviation",
      "journal",
    );
    addVenueField(
      candidates,
      getField(item, "seriesTitle"),
      "seriesTitle",
      "journal",
    );
  } else {
    addVenueField(
      candidates,
      getField(item, "publicationTitle"),
      "publicationTitle",
    );
    addVenueField(
      candidates,
      getField(item, "journalAbbreviation"),
      "journalAbbreviation",
      "journal",
    );
    addVenueField(candidates, getField(item, "seriesTitle"), "seriesTitle");
  }

  for (const abbr of extractBracketAbbr(getField(item, "title"))) {
    addCandidate(candidates, abbr, "title");
  }

  for (const venue of extractExtraVenues(getField(item, "extra"))) {
    addVenueField(candidates, venue, "extra");
  }

  addIdentifierHints(candidates, item);

  return {
    candidates,
    isPreprint: isPreprint(item),
  };
}
