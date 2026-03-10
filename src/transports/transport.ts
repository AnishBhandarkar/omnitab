export interface Transport {
    /**
     * Connect to the transport. May be async (e.g., waiting for SharedWorker to be ready).
     */
    connect(): Promise<void>;

    /**
     * Send a message to all other tabs (broadcast).
     */
    send(message: any): void;

    /**
     * Register a callback for incoming messages.
     */
    onMessage(callback: (message: any) => void): void;

    /**
     * Disconnect and clean up.
     */
    disconnect(): void;

    /**
     * Check if this transport is supported in the current browser.
     */
    isSupported(): boolean;
}