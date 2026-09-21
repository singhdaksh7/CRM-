import { tokenize } from "./tokenizer";
import { listKnownLocalities } from "../locality";
import type { ParsedFilterChip, ParsedQuery, SearchEntityType } from "./search-types";

/**
 * Deterministic keyword -> entity mapping. Longer/more specific phrases are
 * checked first so "follow up" doesn't get swallowed by a looser rule.
 */
const ENTITY_PHRASES: { phrase: string; entity: SearchEntityType }[] = [
  { phrase: "portal listings", entity: "PORTAL" },
  { phrase: "portal listing", entity: "PORTAL" },
  { phrase: "portal leads", entity: "PORTAL" },
  { phrase: "portal lead", entity: "PORTAL" },
  { phrase: "portals", entity: "PORTAL" },
  { phrase: "portal", entity: "PORTAL" },
  { phrase: "follow-ups", entity: "FOLLOW_UP" },
  { phrase: "follow ups", entity: "FOLLOW_UP" },
  { phrase: "followups", entity: "FOLLOW_UP" },
  { phrase: "followup", entity: "FOLLOW_UP" },
  { phrase: "properties", entity: "PROPERTY" },
  { phrase: "property", entity: "PROPERTY" },
  { phrase: "employees", entity: "EMPLOYEE" },
  { phrase: "employee", entity: "EMPLOYEE" },
  { phrase: "visits", entity: "VISIT" },
  { phrase: "visit", entity: "VISIT" },
  { phrase: "documents", entity: "DOCUMENT" },
  { phrase: "document", entity: "DOCUMENT" },
  { phrase: "deals", entity: "DEAL" },
  { phrase: "deal", entity: "DEAL" },
  { phrase: "payments", entity: "PAYMENT" },
  { phrase: "payment", entity: "PAYMENT" },
  { phrase: "catalogues", entity: "CATALOGUE" },
  { phrase: "catalogs", entity: "CATALOGUE" },
  { phrase: "catalogue", entity: "CATALOGUE" },
  { phrase: "notifications", entity: "NOTIFICATION" },
  { phrase: "notification", entity: "NOTIFICATION" },
  { phrase: "leads", entity: "LEAD" },
  { phrase: "lead", entity: "LEAD" },
];

const LEAD_STATUS_WORDS = ["new", "contacted", "qualified", "properties shared", "visit scheduled", "visit completed", "negotiation", "closed won", "closed lost", "not interested", "invalid"];
const LEAD_PRIORITY_WORDS = ["hot", "warm", "cold"];
const PROPERTY_STATUS_WORDS = ["available", "reserved", "rented", "sold", "inactive"];

const MISSING_PHOTOS_PHRASES = ["without photos", "without images", "no photos", "no images", "missing photos", "missing images"];

const PRICE_UNIT_MULTIPLIER: Record<string, number> = { k: 1000, lac: 100000, lakh: 100000, l: 100000 };

function parsePriceToken(raw: string): number | null {
  const match = raw.match(/^(\d+(?:\.\d+)?)(k|lac|lakh|l)?$/i);
  if (!match) return null;
  const base = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const multiplier = unit ? PRICE_UNIT_MULTIPLIER[unit] ?? 1 : 1;
  return Math.round(base * multiplier);
}

/**
 * Turns free text into a structured, deterministic query. Every recognized
 * fragment is removed from the leftover `keywords` so the same word is never
 * double-counted as both a structured filter and a free-text keyword.
 */
export function parseSearchQuery(raw: string): ParsedQuery {
  const tokens = tokenize(raw);
  const consumed = new Set<number>();
  const chips: ParsedFilterChip[] = [];

  let entity: SearchEntityType | null = null;
  let bhk: number | null = null;
  let minPrice: number | null = null;
  let maxPrice: number | null = null;
  let locality: string | null = null;
  let status: string | null = null;
  let employeeName: string | null = null;
  let dateFilter: "TODAY" | "OVERDUE" | null = null;
  let missingPhotos = false;

  const lowerRaw = ` ${tokens.map((t) => t.lower).join(" ")} `;

  // Entity keyword (longest phrase wins, checked in declared order which is already longest-first per group).
  for (const { phrase, entity: e } of ENTITY_PHRASES) {
    if (lowerRaw.includes(` ${phrase} `)) {
      entity = e;
      const phraseTokens = phrase.split(/[\s-]+/);
      markPhraseConsumed(tokens, consumed, phraseTokens);
      chips.push({ key: "entity", label: `In ${e.replace(/_/g, " ").toLowerCase()}` });
      break;
    }
  }

  // "without photos" / "no images" -> PROPERTY + missing-photos filter.
  for (const phrase of MISSING_PHOTOS_PHRASES) {
    if (lowerRaw.includes(` ${phrase} `)) {
      missingPhotos = true;
      entity = entity ?? "PROPERTY";
      markPhraseConsumed(tokens, consumed, phrase.split(" "));
      chips.push({ key: "missingPhotos", label: "Without photos" });
      break;
    }
  }

  // "today" -> TODAY, applies to whichever entity (visits/follow-ups) is in scope.
  const todayIdx = tokens.findIndex((t, i) => !consumed.has(i) && t.lower === "today");
  if (todayIdx !== -1) {
    dateFilter = "TODAY";
    consumed.add(todayIdx);
    chips.push({ key: "date", label: "Today" });
  }
  const overdueIdx = tokens.findIndex((t, i) => !consumed.has(i) && t.lower === "overdue");
  if (overdueIdx !== -1) {
    dateFilter = "OVERDUE";
    consumed.add(overdueIdx);
    chips.push({ key: "date", label: "Overdue" });
  }

  // "2 bhk" / "2bhk"
  const bhkMatch = lowerRaw.match(/(\d+)\s*bhk/);
  if (bhkMatch) {
    bhk = Number(bhkMatch[1]);
    tokens.forEach((t, i) => {
      if (!consumed.has(i) && (t.lower === bhkMatch[1] || t.lower === `${bhkMatch[1]}bhk` || t.lower === "bhk")) consumed.add(i);
    });
    chips.push({ key: "bhk", label: `${bhk} BHK` });
  }

  // "under 35000" / "below 35k" / "less than 1.2l"; "above 20000" / "over 20k"
  for (let i = 0; i < tokens.length; i++) {
    if (consumed.has(i)) continue;
    const word = tokens[i].lower;
    if (word === "under" || word === "below") {
      const next = tokens[i + 1];
      const value = next ? parsePriceToken(next.lower) : null;
      if (value !== null) {
        maxPrice = value;
        consumed.add(i);
        consumed.add(i + 1);
        chips.push({ key: "maxPrice", label: `Under ₹${value.toLocaleString("en-IN")}` });
      }
    } else if (word === "above" || word === "over") {
      const next = tokens[i + 1];
      const value = next ? parsePriceToken(next.lower) : null;
      if (value !== null) {
        minPrice = value;
        consumed.add(i);
        consumed.add(i + 1);
        chips.push({ key: "minPrice", label: `Above ₹${value.toLocaleString("en-IN")}` });
      }
    }
  }

  // "employee rohit" / "assigned to rohit" - checked even if the "employee"
  // token itself was already marked consumed by the entity-phrase step
  // above (that step only recognizes the word "employee", it doesn't know
  // whether a name follows), so only the target name token needs to be free.
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].lower === "employee" && tokens[i + 1] && !consumed.has(i + 1)) {
      employeeName = tokens[i + 1].raw;
      consumed.add(i);
      consumed.add(i + 1);
      chips.push({ key: "employee", label: `Employee: ${employeeName}` });
      break;
    }
    if (tokens[i].lower === "assigned" && tokens[i + 1]?.lower === "to" && tokens[i + 2] && !consumed.has(i + 2)) {
      employeeName = tokens[i + 2].raw;
      consumed.add(i);
      consumed.add(i + 1);
      consumed.add(i + 2);
      chips.push({ key: "employee", label: `Employee: ${employeeName}` });
      break;
    }
  }

  // Status / priority words (Lead status, Lead priority, Property status).
  const statusVocab = [...LEAD_STATUS_WORDS, ...LEAD_PRIORITY_WORDS, ...PROPERTY_STATUS_WORDS];
  for (const word of statusVocab) {
    if (lowerRaw.includes(` ${word} `)) {
      status = word.toUpperCase().replace(/ /g, "_");
      markPhraseConsumed(tokens, consumed, word.split(" "));
      chips.push({ key: "status", label: word.replace(/\b\w/g, (c) => c.toUpperCase()) });
      break;
    }
  }

  // Known Delhi localities (multi-word aware).
  const localities = listKnownLocalities();
  for (const known of localities) {
    const knownLower = ` ${known.toLowerCase()} `;
    if (lowerRaw.includes(knownLower)) {
      locality = known;
      markPhraseConsumed(tokens, consumed, known.toLowerCase().split(" "));
      chips.push({ key: "locality", label: known });
      break;
    }
  }

  const keywords = tokens.filter((_, i) => !consumed.has(i)).map((t) => t.raw);
  if (keywords.length > 0 && !locality && !employeeName) {
    chips.push({ key: "keywords", label: keywords.join(" ") });
  }

  return { raw, entity, keywords, bhk, minPrice, maxPrice, locality, status, employeeName, dateFilter, missingPhotos, chips };
}

/** Marks the token indices making up a (possibly multi-word) phrase as consumed, matching case-insensitively and tolerating punctuation like "follow-ups" vs "follow ups". */
function markPhraseConsumed(tokens: { lower: string }[], consumed: Set<number>, phraseWords: string[]) {
  const cleanPhraseWords = phraseWords.filter(Boolean);
  for (let i = 0; i <= tokens.length - cleanPhraseWords.length; i++) {
    let matches = true;
    for (let j = 0; j < cleanPhraseWords.length; j++) {
      if (tokens[i + j].lower.replace(/-/g, "") !== cleanPhraseWords[j].replace(/-/g, "")) {
        matches = false;
        break;
      }
    }
    if (matches) {
      for (let j = 0; j < cleanPhraseWords.length; j++) consumed.add(i + j);
      return;
    }
  }
}
