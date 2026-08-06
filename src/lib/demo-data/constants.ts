/** Shared name pools, geography, and ID helpers for the demo seed framework. */

export const DEMO_ORGANIZATION_ID = "org_default";
/** "KP-DEMO-" per the Phase 2 spec - every demo id/code carries this prefix so scripts/remove-demo.ts can find (and the UI can detect) exactly what this seed created and nothing else. */
export const DEMO_ID_PREFIX = "kp-demo-";
export const DEMO_CODE_PREFIX = "KP-DEMO-";
export const DEMO_EMAIL_DOMAIN = "kpproperties.demo";

/** Deterministic id for a demo record: e.g. demoId("prop", 42) -> "kp-demo-prop-00042". */
export function demoId(entity: string, index: number): string {
  return `${DEMO_ID_PREFIX}${entity}-${String(index).padStart(5, "0")}`;
}

/** Deterministic human-facing code: e.g. demoCode("PROP", 42) -> "KP-DEMO-PROP-00042". */
export function demoCode(prefix: string, index: number): string {
  return `${DEMO_CODE_PREFIX}${prefix}-${String(index).padStart(5, "0")}`;
}

export const AREAS = [
  "Karol Bagh", "Ramesh Nagar", "Rajouri Garden", "Patel Nagar", "Punjabi Bagh",
  "Janakpuri", "Tilak Nagar", "Kirti Nagar", "Moti Nagar", "Dwarka",
  "Paschim Vihar", "Subhash Nagar", "Hari Nagar", "Shadipur", "Naraina",
] as const;

/** Approximate Delhi-area lat/lng bounding boxes per locality, used for realistic (not GPS-accurate) coordinates. */
export const AREA_COORDS: Record<string, { lat: number; lng: number }> = {
  "Karol Bagh": { lat: 28.6519, lng: 77.1909 },
  "Patel Nagar": { lat: 28.6503, lng: 77.1706 },
  "Rajouri Garden": { lat: 28.6492, lng: 77.1201 },
  "Ramesh Nagar": { lat: 28.6553, lng: 77.1306 },
  "Kirti Nagar": { lat: 28.6516, lng: 77.1451 },
  "Punjabi Bagh": { lat: 28.6692, lng: 77.1313 },
  "Tilak Nagar": { lat: 28.6414, lng: 77.0914 },
  "Janakpuri": { lat: 28.6219, lng: 77.0878 },
  "Dwarka": { lat: 28.5921, lng: 77.0460 },
  "Paschim Vihar": { lat: 28.6733, lng: 77.1031 },
  "Naraina": { lat: 28.6297, lng: 77.1391 },
  "Shadipur": { lat: 28.6508, lng: 77.1583 },
  "Subhash Nagar": { lat: 28.6398, lng: 77.1088 },
  "Hari Nagar": { lat: 28.6284, lng: 77.1078 },
  "Moti Nagar": { lat: 28.6558, lng: 77.1499 },
};

export const AMENITIES_POOL = [
  "Lift", "Power Backup", "24x7 Security", "Swimming Pool", "Gym", "Club House",
  "Children's Play Area", "Covered Parking", "CCTV", "Park Facing", "Modular Kitchen", "Water Storage",
] as const;

/** First names + last names, combined at generation time for volume without repeating identical full names too often. */
export const INDIAN_FIRST_NAMES_MALE = [
  "Rahul", "Amit", "Vikas", "Sanjay", "Rohit", "Karan", "Manoj", "Naveen", "Gaurav", "Tarun",
  "Vivek", "Arjun", "Deepak", "Ashok", "Rajeev", "Suresh", "Vikram", "Ajay", "Anil", "Sunil",
  "Pankaj", "Ravi", "Vinod", "Manish", "Rakesh", "Yogesh", "Sandeep", "Harish", "Mahesh", "Dinesh",
];
export const INDIAN_FIRST_NAMES_FEMALE = [
  "Priya", "Neha", "Pooja", "Kavita", "Anjali", "Simran", "Divya", "Ritu", "Shweta", "Meera",
  "Swati", "Nisha", "Anita", "Poonam", "Rekha", "Manju", "Sunita", "Geeta", "Preeti", "Anju",
  "Kiran", "Seema", "Rachna", "Deepika", "Komal", "Radha", "Usha", "Renu", "Shalini", "Vandana",
];
export const INDIAN_LAST_NAMES = [
  "Sharma", "Verma", "Singh", "Kapoor", "Yadav", "Mehta", "Gupta", "Joshi", "Malhotra", "Nair",
  "Chopra", "Kaur", "Tiwari", "Reddy", "Kumar", "Agarwal", "Bhatt", "Pandey", "Saxena", "Iyer",
  "Khanna", "Bhalla", "Menon", "Rawat", "Dutta", "Sethi", "Arora", "Chawla", "Bansal", "Bhatia",
  "Tandon", "Sabharwal", "Sood", "Anand", "Chaudhary", "Rastogi", "Mathur", "Nagpal", "Kohli", "Sabharwal",
];

export const OWNER_NOTE_TEMPLATES = [
  "Prefers verified tenants only.",
  "Owner lives abroad, coordinates via WhatsApp.",
  "Flexible on price for long-term tenants.",
  "Requires 2-month advance security deposit.",
  "Property recently renovated, owner is particular about upkeep.",
  "Owner also has 2 more properties in the same locality.",
  "Prefers dealing directly with families.",
  "Owner is elderly, son handles all negotiations.",
  "Open to negotiation on brokerage.",
  null,
  null,
];

export const LEAD_ADDITIONAL_REQUIREMENTS = [
  "Needs property near metro station",
  "Prefers ground floor or with lift",
  "Looking for pet-friendly property",
  "Needs covered parking for 2 vehicles",
  "Prefers newly constructed building",
  "Client is relocating for work, needs quick closure",
  "Wants a corner unit with good ventilation",
  null,
  null,
];

/** BHK -> realistic monthly-rent tier pool (matches the task's requested budget spread). */
/** Matches the Phase 2 spec's explicit range: ₹9,000 to ₹1,20,000. */
export const RENT_BUDGET_TIERS = [9000, 12000, 15000, 18000, 22000, 25000, 30000, 40000, 50000, 75000, 90000, 120000] as const;

export function fullName(rng: { pick: <T>(a: readonly T[]) => T; bool: (p?: number) => boolean }): string {
  const isMale = rng.bool();
  const first = isMale ? rng.pick(INDIAN_FIRST_NAMES_MALE) : rng.pick(INDIAN_FIRST_NAMES_FEMALE);
  const last = rng.pick(INDIAN_LAST_NAMES);
  return `${first} ${last}`;
}

/**
 * Deliberately, visibly fake phone number - NOT a randomized valid-looking
 * one. India has no official "reserved for fiction" mobile range (unlike
 * NANP's 555), so the only reliable way to guarantee "cannot contact a real
 * customer" is structural: this framework never calls any SMS/WhatsApp/
 * dialer API with these numbers (verified - see the safety audit), and on
 * top of that, every number here uses the same fixed, non-allocated-looking
 * "90000" block followed by a sequential index, so it also reads as
 * obviously synthetic to any human looking at the data (the same idea as
 * "555-0100" in US media, applied to the 10-digit Indian mobile format).
 * Deterministic per index so re-seeds are stable.
 */
export function demoPhone(index: number, salt = 0): string {
  const sequence = (index * 7 + salt) % 100000;
  return `+9190000${String(sequence).padStart(5, "0")}`;
}

export function slugifyEmail(name: string, index: number): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, ".")}.${index}@${DEMO_EMAIL_DOMAIN}`;
}
