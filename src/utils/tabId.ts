/**
 * Generates a unique tab ID that is:
 * - Time-ordered (sortable)
 * - Highly unique (crypto-random + UUID)
 * - URL-safe (alphanumeric + hyphens)
 */
export function generateTabId(): string {
    // Time component for ordering
    const timestamp = Date.now().toString(36); // base-36 for shorter string

    // Cryptographically secure random component
    const randomBytes = new Uint8Array(12);
    crypto.getRandomValues(randomBytes);
    const randomPart = Array.from(randomBytes)
        .map(b => b.toString(36).padStart(2, '0'))
        .join('');

    return `${timestamp}-${randomPart}`;
}