export function generateTabId(): string {
    const timestamp = Date.now().toString(36);

    const randomBytes = new Uint8Array(12);
    crypto.getRandomValues(randomBytes);
    const randomPart = Array.from(randomBytes)
        .map(b => b.toString(36).padStart(2, '0'))
        .join('');

    return `${timestamp}-${randomPart}`;
}