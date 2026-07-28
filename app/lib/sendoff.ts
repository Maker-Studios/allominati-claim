export const SENDOFF_MAX_LENGTH = 5000;

/**
 * The exact EIP-191 message a holder signs on the send-off screen. The
 * backend rebuilds it verbatim to verify the signature, so any change here
 * invalidates submissions that are mid-flight.
 */
export function sendoffSignPayload(address: string, message: string): string {
  return `allominati send-off\nfrom: ${address.toLowerCase()}\n\n${message}`;
}
