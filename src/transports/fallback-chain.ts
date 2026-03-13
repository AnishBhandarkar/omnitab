import { Transport } from './transport';
import { BroadcastChannelTransport } from './broadcast-channel';
import { StorageEventTransport } from './storage-event';
import { SharedWorkerTransport } from './shared-worker';
import { FallbackChainOptions, QueuedMessage } from '../types';



export class FallbackChain implements Transport {
    private transports: Transport[] = [];
    private activeTransport: Transport | null = null;
    private messageCallback: ((message: any) => void) | null = null;
    private healthCheckInterval: number | null = null;
    private isCheckingHealth: boolean = false;

    // Message queue
    private messageQueue: QueuedMessage[] = [];
    private isProcessingQueue: boolean = false;
    private queueRetryTimer: number | null = null;

    constructor(
        private namespace: string,
        private options: FallbackChainOptions = {}
    ) {
        
        // Order by preference: best first
        this.transports = [
            new SharedWorkerTransport(namespace, options.worker),
            new BroadcastChannelTransport(namespace),
            new StorageEventTransport(namespace, options.storage),
        ].filter(t => t.isSupported());

        // Log browser support info
        this.logBrowserSupport();

        // Set defaults
        this.options.maxRetries = options.maxRetries || 3;
        this.options.retryBackoff = options.retryBackoff || 2;
        this.options.retryDelay = options.retryDelay || 1000;


    }

    async connect(): Promise<void> {
        for (const transport of this.transports) {
            try {
                await transport.connect();
                this.activeTransport = transport;
                // Forward messages from the active transport to our callback
                transport.onMessage((msg) => {
                    if (this.messageCallback) {
                        this.messageCallback(msg);
                    }
                });
                console.log(`Omnitab: connected via ${transport.constructor.name}`);

                // Start health checks if enabled
                if (this.options.enableHealthChecks) {
                    this.startHealthChecks();
                }

                // Process any queued messages
                this.processQueue();

                return;
            } catch (err) {
                console.warn(`Omnitab: ${transport.constructor.name} failed`, err);
                // Continue to next transport
            }
        }
        throw new Error('No transport available');
    }

    send(message: any): void {
        if (!this.activeTransport) {
            console.warn('Omnitab: not connected, cannot send');
            return;
        }

        // If queue is enabled, use it
        if (this.options.enableMessageQueue) {
            this.queueMessage(message);
        } else {
            // Direct send (existing behavior)
            this.directSend(message);
        }
    }

    onMessage(callback: (message: any) => void): void {
        this.messageCallback = callback;
    }

    disconnect(): void {
        this.stopHealthChecks();
        this.stopQueueProcessing();

        if (this.activeTransport) {
            this.activeTransport.disconnect();
            this.activeTransport = null;
        }
        this.messageCallback = null;
        this.messageQueue = [];
    }

    isSupported(): boolean {
        return this.transports.length > 0;
    }

    /**
     * Get current active transport name (for debugging)
     */
    getActiveTransport(): string {
        return this.activeTransport?.constructor.name || 'none';
    }

    // ============================================================================
    // Health Checks (Optional - opt-in via options.enableHealthChecks)
    // ============================================================================

    private startHealthChecks(): void {
        if (this.healthCheckInterval) return;

        const interval = this.options.healthCheckInterval || 10000;

        this.healthCheckInterval = window.setInterval(() => {
            this.checkHealth();
        }, interval);
    }

    private stopHealthChecks(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    private async checkHealth(): Promise<void> {
        if (!this.activeTransport || this.isCheckingHealth) return;

        this.isCheckingHealth = true;

        try {
            // Try to send a ping (works with all transports)
            // Using a special internal message that transports will ignore
            this.activeTransport.send({
                type: '__health_check__',
                timestamp: Date.now()
            });

            // If we get here, send succeeded
            this.isCheckingHealth = false;

        } catch (error) {
            console.warn(`Omnitab: Health check failed on ${this.activeTransport.constructor.name}`);

            // Transport is dead, try to reconnect
            await this.reconnect();
            this.isCheckingHealth = false;
        }
    }

    private async reconnect(): Promise<void> {
        console.log('Omnitab: Attempting to reconnect...');

        // Disconnect current transport
        if (this.activeTransport) {
            try {
                this.activeTransport.disconnect();
            } catch (e) {
                // Ignore
            }
            this.activeTransport = null;
        }

        // Try all transports again
        await this.connect();
    }

    // ============================================================================
    // Direct Send (No Queue)
    // ============================================================================

    private directSend(message: any): void {
        try {
            this.activeTransport?.send(message);
        } catch (err) {
            console.warn('Omnitab: send failed', err);
            // Trigger health check to detect dead transport
            if (this.options.enableHealthChecks) {
                this.checkHealth();
            }
        }
    }

    // ============================================================================
    // Message Queue with Retry
    // ============================================================================

    private queueMessage(message: any): void {
        this.messageQueue.push({
            message,
            attempts: 0,
            timestamp: Date.now()
        });

        this.processQueue();
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessingQueue || !this.activeTransport || this.messageQueue.length === 0) {
            return;
        }

        this.isProcessingQueue = true;

        while (this.messageQueue.length > 0) {
            const queued = this.messageQueue[0];

            try {
                await this.sendWithRetry(queued);
                // Success - remove from queue
                this.messageQueue.shift();
            } catch (err) {
                // Failed - stop processing, will retry later
                console.warn(`Omnitab: message failed after ${queued.attempts} attempts`, err);
                this.scheduleQueueRetry();
                break;
            }
        }

        this.isProcessingQueue = false;
    }

    private async sendWithRetry(queued: QueuedMessage): Promise<void> {
        const maxRetries = this.options.maxRetries!;

        while (queued.attempts < maxRetries) {
            try {
                this.activeTransport?.send(queued.message);
                return; // Success
            } catch (err) {
                queued.attempts++;

                if (queued.attempts >= maxRetries) {
                    throw err; // Max retries exceeded
                }

                // Wait with exponential backoff before retry
                const delay = this.options.retryDelay! *
                    Math.pow(this.options.retryBackoff!, queued.attempts - 1);

                await new Promise(resolve => setTimeout(resolve, delay));

                // If transport changed during retry, continue with new transport
                if (!this.activeTransport) {
                    throw new Error('No active transport');
                }
            }
        }
    }

    private scheduleQueueRetry(): void {
        if (this.queueRetryTimer) {
            clearTimeout(this.queueRetryTimer);
        }

        this.queueRetryTimer = window.setTimeout(() => {
            this.queueRetryTimer = null;
            this.processQueue();
        }, this.options.retryDelay! * 2); // Wait twice initial delay before retry
    }

    private stopQueueProcessing(): void {
        if (this.queueRetryTimer) {
            clearTimeout(this.queueRetryTimer);
            this.queueRetryTimer = null;
        }
        this.isProcessingQueue = false;
    }

    private logBrowserSupport(): void {
        const styles = {
            info: 'color: #0066cc; font-weight: bold;',
            warn: 'color: #cc6600; font-weight: bold;',
            success: 'color: #00aa00;'
        };

        console.group('%c🌐 Omnitab Browser Support', 'font-size: 14px; font-weight: bold;');

        // Check each transport
        const sharedWorkerSupported = typeof SharedWorker !== 'undefined';
        const broadcastSupported = typeof BroadcastChannel !== 'undefined';
        const storageSupported = this.checkStorageSupport();

        console.log(
            `%cSharedWorker: ${sharedWorkerSupported ? '✅' : '❌'}`,
            sharedWorkerSupported ? styles.success : styles.warn
        );
        if (!sharedWorkerSupported) {
            console.log(
                '%c  ↳ Safari and some mobile browsers lack SharedWorker support',
                'color: #666; font-style: italic;'
            );
        }

        console.log(
            `%cBroadcastChannel: ${broadcastSupported ? '✅' : '❌'}`,
            broadcastSupported ? styles.success : styles.warn
        );
        if (!broadcastSupported) {
            console.log(
                '%c  ↳ Older browsers (IE11, Safari <15.4) need StorageEvent fallback',
                'color: #666; font-style: italic;'
            );
        }

        console.log(
            `%cStorageEvent: ${storageSupported ? '✅' : '❌'}`,
            storageSupported ? styles.success : styles.warn
        );

        // Show which transport will be used
        const primary = this.transports[0]?.constructor.name || 'none';
        const fallbacks = this.transports.slice(1).map(t => t.constructor.name).join(' → ') || 'none';

        console.log('%c📡 Transport Chain:', 'font-weight: bold;');
        console.log(`  Primary: ${primary}`);
        console.log(`  Fallbacks: ${fallbacks || 'none'}`);

        // Performance implications
        if (this.transports[0] instanceof StorageEventTransport) {
            console.warn(
                '%c⚠️  Only StorageEvent available - performance may be reduced',
                'font-weight: bold;'
            );
        }

        console.groupEnd();
    }

    private checkStorageSupport(): boolean {
        try {
            const testKey = '__omnitab_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch {
            return false;
        }
    }
}