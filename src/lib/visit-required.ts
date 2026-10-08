/**
 * Contract for "a lead cannot become Visit Completed without a visit".
 * Dependency-free so the server (PATCH /api/leads/[id]) and the client dialog share one source.
 */
export const VISIT_REQUIRED_CODE = "VISIT_REQUIRED";
export const VISIT_REQUIRED_TITLE = "No visit on record";
export const VISIT_REQUIRED_MESSAGE =
  "This lead does not have an active visit to complete. Log the completed visit before marking the lead as Visit Completed.";
