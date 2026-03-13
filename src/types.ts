export interface FallbackChainOptions {
    worker?: SharedWorkerTransportOptions;

    storage?: StorageEventTransportOptions;

    /** Enable health checks (default: false) */
    enableHealthChecks?: boolean;

    /** Health check interval in ms (default: 10000) */
    healthCheckInterval?: number;

    /** Enable message queue with retry (default: false) */
    enableMessageQueue?: boolean;

    /** Max retry attempts per message (default: 3) */
    maxRetries?: number;

    /** Retry backoff multiplier (default: 2) */
    retryBackoff?: number;

    /** Initial retry delay in ms (default: 1000) */
    retryDelay?: number;
}

export interface SharedWorkerTransportOptions {
    /** Timeout for worker connection in ms */
    connectTimeout?: number;

    /** Heartbeat interval in ms */
    heartbeatInterval?: number;
}

export interface StorageEventTransportOptions {
    /** 
     * Time-to-live for messages in milliseconds. 
     * Messages older than this are ignored and deleted.
     * @default 5000 (5 seconds)
     */
    ttl?: number;

    /** 
     * Maximum number of messages to store simultaneously.
     * Prevents unlimited growth if cleanup fails.
     * @default 100
     */
    maxMessages?: number;

    /** 
     * Maximum message size in bytes.
     * Prevents giant messages from filling storage.
     * @default 102400 (100KB)
     */
    maxMessageSize?: number;

    /** 
     * What to do when localStorage is full.
     * 
     * - 'none': (SAFE DEFAULT) Don't evict anything. Notify via callback and fail.
     * - 'oldest': Delete oldest messages to make room.
     * - 'error': Throw error and don't attempt storage.
     * 
     * WARNING: 'oldest' may delete messages from other tabs/apps
     * that share the same namespace prefix. Use with caution.
     * 
     * @default 'none'
     */
    evictionPolicy?: 'none' | 'oldest' | 'error';

    /** 
     * Callback when storage is full.
     * Useful for apps to show warnings or implement custom handling.
     */
    onStorageFull?: (error: StorageFullError) => void;

    /** 
     * Threshold (0-1) for storage warning.
     * Warning logged when usage exceeds this percentage of estimated quota.
     * @default 0.8 (80%)
     */
    warnThreshold?: number;

    /** 
     * Enable periodic storage monitoring.
     * @default true
     */
    enableMonitoring?: boolean;
}

export interface ConnectedTab {
    port: MessagePort;
    tabId: string;
    connectedAt: number;
    lastPing: number;
}

export interface QueuedMessage {
    message: any;
    attempts: number;
    timestamp: number;
}

export interface StorageEventMessage {
    id: string;
    timestamp: number;
    namespace: string;
    data: any;
    size?: number;
}

export interface StorageFullError extends Error {
    name: 'StorageFullError';
    currentUsage: number;
    estimatedQuota?: number;
}

