import { DEFAULT_STORAGE_OPTIONS } from '../constants';
import { StorageEventMessage, StorageEventTransportOptions, StorageFullError } from '../types';
import { Transport } from './transport';

export class StorageEventTransport implements Transport {
    private readonly STORAGE_KEY_PREFIX = 'omnitab:';
    private messageCallback: ((message: any) => void) | null = null;
    private storageListener: ((event: StorageEvent) => void) | null = null;
    private connected: boolean = false;
    private options: Required<StorageEventTransportOptions>;

    private messageQueue: any[] = [];
    private isProcessingQueue = false;

    private monitorInterval: NodeJS.Timeout | null = null;
    private lastWarningTime: number = 0;
    private readonly WARNING_COOLDOWN = 60000; // 1 minute between warnings

    constructor(
        private namespace: string,
        options: StorageEventTransportOptions = {}
    ) {
        this.options = {
            ttl: DEFAULT_STORAGE_OPTIONS.TTL,
            maxMessages: DEFAULT_STORAGE_OPTIONS.MAX_MESSAGES,
            maxMessageSize: DEFAULT_STORAGE_OPTIONS.MAX_MESSAGE_SIZE,
            evictionPolicy: DEFAULT_STORAGE_OPTIONS.EVICTION_POLICY,
            onStorageFull: () => { },
            warnThreshold: DEFAULT_STORAGE_OPTIONS.WARN_THRESHOLD,
            enableMonitoring: DEFAULT_STORAGE_OPTIONS.ENABLE_MONITORING,
            ...options
        };
    }

    async connect(): Promise<void> {
        if (!this.isSupported()) {
            throw new Error('localStorage not supported');
        }

        // Set up storage event listener
        this.storageListener = (event: StorageEvent) => {
            this.handleStorageEvent(event);
        };

        window.addEventListener('storage', this.storageListener);
        this.connected = true;

        // Initial cleanup
        await this.cleanup();

        // Start monitoring if enabled
        if (this.options.enableMonitoring) {
            this.startMonitoring();
        }
    }

    send(message: any): void {
        if (!this.connected) {
            console.warn('Omnitab: Not connected, cannot send');
            return;
        }

        try {
            this.validateMessageSize(message);
        } catch (e) {
            console.warn('Omnitab: Message too large, dropping', e);
            return;
        }
        this.queueMessage(message);
    }

    onMessage(callback: (message: any) => void): void {
        this.messageCallback = callback;
    }

    disconnect(): void {
        if (this.storageListener) {
            window.removeEventListener('storage', this.storageListener);
            this.storageListener = null;
        }

        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        this.messageCallback = null;
        this.connected = false;
        this.messageQueue = [];

        this.cleanup(true);
    }

    isSupported(): boolean {
        try {
            const testKey = `${this.STORAGE_KEY_PREFIX}test`;
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    }

    private generateMessageId(): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        const unique = crypto.randomUUID?.().split('-')[0] || random;
        return `${timestamp}-${random}-${unique}`;
    }

    private getStorageKey(messageId: string): string {
        return `${this.STORAGE_KEY_PREFIX}${this.namespace}:${messageId}`;
    }

    private validateMessageSize(message: any): void {
        const size = new Blob([JSON.stringify(message)]).size;
        if (size > this.options.maxMessageSize) {
            throw new Error(
                `Message too large (${size} bytes). ` +
                `Max: ${this.options.maxMessageSize} bytes`
            );
        }
    }

    private queueMessage(message: any): void {
        this.messageQueue.push(message);

        if (!this.isProcessingQueue) {
            // Process queue asynchronously
            setTimeout(() => this.processQueue(), 0);
        }
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue) return;

        this.isProcessingQueue = true;

        while (this.messageQueue.length > 0) {
            const message = this.messageQueue[0];

            try {
                await this.attemptSend(message);
                // Success - remove from queue
                this.messageQueue.shift();
            } catch (e) {
                // Failed - stop processing (will retry later)
                console.warn('Omnitab: Failed to send message, will retry', e);
                break;
            }
        }

        this.isProcessingQueue = false;
    }

    private async attemptSend(message: any): Promise<void> {
        const messageId = this.generateMessageId();
        const key = this.getStorageKey(messageId);

        const storageMessage: StorageEventMessage = {
            id: messageId,
            timestamp: Date.now(),
            namespace: this.namespace,
            data: message,
            size: new Blob([JSON.stringify(message)]).size
        };

        try {
            await this.enforceMaxMessages();

            // Try to store the message
            localStorage.setItem(key, JSON.stringify(storageMessage));

            // Schedule automatic cleanup
            setTimeout(() => {
                localStorage.removeItem(key);
            }, this.options.ttl);

            // For current tab, simulate message receipt
            // (storage events don't fire in the originating tab)
            if (this.messageCallback) {
                this.messageCallback(message);
            }

        } catch (e) {
            if (this.isQuotaError(e)) {
                await this.handleStorageFull(message, storageMessage);
            } else {
                throw e;
            }
        }
    }

    private isQuotaError(error: any): boolean {
        return error.name === 'QuotaExceededError' ||
            error.name === 'NS_ERROR_DOM_QUOTA_REACHED' || // Firefox
            (error.code === 22); // IE/Edge
    }


    private async handleStorageFull(
        originalMessage: any,
        storageMessage: StorageEventMessage
    ): Promise<void> {
        // Create error with details
        const error = this.createStorageFullError();

        switch (this.options.evictionPolicy) {
            case 'oldest':
                // DANGEROUS: Delete oldest messages to make room
                const evicted = await this.evictOldestMessages(5);

                if (evicted > 0) {
                    // Retry after eviction
                    try {
                        const key = this.getStorageKey(storageMessage.id);
                        localStorage.setItem(key, JSON.stringify(storageMessage));

                        // Schedule cleanup
                        setTimeout(() => {
                            localStorage.removeItem(key);
                        }, this.options.ttl);

                        // Deliver to current tab
                        if (this.messageCallback) {
                            this.messageCallback(originalMessage);
                        }

                        return;
                    } catch (e) {
                        // Still full after eviction - notify and fail
                        this.options.onStorageFull(error);
                    }
                } else {
                    // No messages to evict
                    this.options.onStorageFull(error);
                }
                break;

            case 'error':
                // Don't attempt storage, just notify
                this.options.onStorageFull(error);
                break;

            case 'none':
            default:
                // SAFE DEFAULT: Don't evict anything
                // Notify via callback
                this.options.onStorageFull(error);

                // Deliver to current tab only (in-memory)
                if (this.messageCallback) {
                    this.messageCallback(originalMessage);
                }

                // Log warning (once per minute)
                this.logStorageWarning('localStorage full - cross-tab sync degraded');
                break;
        }
    }

    private createStorageFullError(): StorageFullError {
        const usage = this.estimateStorageUsage();
        const error = new Error('localStorage is full') as StorageFullError;
        error.name = 'StorageFullError';
        error.currentUsage = usage.current;
        error.estimatedQuota = usage.quota;
        return error;
    }

    private async enforceMaxMessages(): Promise<void> {
        const messages = this.getAllMessages();

        if (messages.length >= this.options.maxMessages) {
            // Delete oldest 20% of messages
            const deleteCount = Math.ceil(this.options.maxMessages * 0.2);
            await this.evictOldestMessages(deleteCount);
        }
    }

    private getAllMessages(): Array<{ key: string, timestamp: number }> {
        const messages: Array<{ key: string, timestamp: number }> = [];

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(this.STORAGE_KEY_PREFIX + this.namespace)) {
                try {
                    const value = localStorage.getItem(key);
                    if (value) {
                        const msg = JSON.parse(value);
                        messages.push({
                            key,
                            timestamp: msg.timestamp
                        });
                    }
                } catch (e) {
                    // If we can't parse, schedule for deletion
                    localStorage.removeItem(key);
                }
            }
        }

        return messages;
    }

    private async evictOldestMessages(count: number): Promise<number> {
        const messages = this.getAllMessages();

        // Sort by timestamp (oldest first)
        messages.sort((a, b) => a.timestamp - b.timestamp);

        // Delete oldest up to count
        const toDelete = messages.slice(0, Math.min(count, messages.length));
        toDelete.forEach(msg => localStorage.removeItem(msg.key));

        return toDelete.length;
    }

    private handleStorageEvent(event: StorageEvent): void {
        // Only listen to our own keys
        if (!event.key?.startsWith(this.STORAGE_KEY_PREFIX + this.namespace)) {
            return;
        }

        // Ignore if no new value (deletions)
        if (!event.newValue) return;

        if (this.messageCallback) {
            try {
                const message: StorageEventMessage = JSON.parse(event.newValue);

                // Ignore stale messages
                if (Date.now() - message.timestamp > this.options.ttl) {
                    return;
                }

                // Forward to callback
                this.messageCallback(message.data);
            } catch (e) {
                console.warn('Omnitab: Failed to parse storage event', e);
            }
        }
    }

    private async cleanup(all: boolean = false): Promise<void> {
        try {
            const now = Date.now();
            const keysToRemove: string[] = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key?.startsWith(this.STORAGE_KEY_PREFIX + this.namespace)) {
                    continue;
                }

                if (all) {
                    keysToRemove.push(key);
                    continue;
                }


                try {
                    const value = localStorage.getItem(key);
                    if (value) {
                        const message: StorageEventMessage = JSON.parse(value);
                        if (now - message.timestamp > this.options.ttl) {
                            keysToRemove.push(key);
                        }
                    }
                } catch (e) {
                    keysToRemove.push(key);
                }
            }

            // Remove old messages
            keysToRemove.forEach(key => localStorage.removeItem(key));
        } catch (e) {
            console.warn('Omnitab: Cleanup failed', e);
        }
    }

    private estimateStorageUsage(): { current: number; quota: number | undefined } {
        let total = 0;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i)!;
            const value = localStorage.getItem(key);
            total += (key?.length || 0) + (value?.length || 0);
        }

        // Rough quota estimation (most browsers: 5MB)
        // Multiply by 2 because we're counting characters, not bytes
        const estimatedQuota = 5 * 1024 * 1024; // 5MB assumption

        return {
            current: total,
            quota: estimatedQuota
        };
    }

    private startMonitoring(): void {
        this.monitorInterval = setInterval(() => {
            this.monitorStorageUsage();
        }, this.WARNING_COOLDOWN); // Every minute
    }

    private monitorStorageUsage(): void {
        const { current, quota } = this.estimateStorageUsage();

        if (quota && current > quota * this.options.warnThreshold) {
            this.logStorageWarning(
                `Storage usage high: ${Math.round(current / 1024)}KB / ` +
                `${Math.round(quota / 1024)}KB (${Math.round(current / quota * 100)}%)`
            );
        }
    }

    private logStorageWarning(message: string): void {
        const now = Date.now();
        if (now - this.lastWarningTime > this.WARNING_COOLDOWN) {
            console.warn(`Omnitab: ${message}`);
            this.lastWarningTime = now;
        }
    }
}