const CUSTOMER_CARE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours, per Meta's customer-service-window policy

/**
 * Meta's WhatsApp Business customer-service window: once a client messages
 * a business, free-form session (non-template) replies are only permitted
 * for 24 hours after that inbound message. Outside the window, sending a
 * plain text message is rejected by Meta - an approved template is
 * required instead. This function only ever looks at the *inbound* side
 * (never guesses from outbound activity, per spec) and is a pure function
 * so its boundary behavior is exactly testable.
 *
 * `lastInboundAt: null` (the client has never messaged this conversation)
 * is always outside the window - there is nothing to open one.
 */
export function isWithinCustomerCareWindow(lastInboundAt: Date | null | undefined, now: Date = new Date()): boolean {
  if (!lastInboundAt) return false;
  const elapsedMs = now.getTime() - new Date(lastInboundAt).getTime();
  return elapsedMs >= 0 && elapsedMs < CUSTOMER_CARE_WINDOW_MS;
}

export { CUSTOMER_CARE_WINDOW_MS };
