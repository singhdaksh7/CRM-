/**
 * Deterministic, template-based timeline summaries - no AI, no free-text
 * generation. Every sentence is built from a fixed template filled with a
 * concrete count/date already present in the data; nothing is inferred or
 * guessed beyond what the underlying Activity/FollowUp rows actually show.
 */
export interface TimelineSummaryLine {
  id: string;
  text: string;
  /** Number of source Activity rows this line was derived from - lets the UI show "(3)" or similar, and jump to the Activity tab. */
  sourceCount: number;
}

export interface TimelineSummaryResult {
  lines: TimelineSummaryLine[];
}
