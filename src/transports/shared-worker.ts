import { DEFAULT_WORKER_OPTIONS } from '../constants';
import { SharedWorkerTransportOptions } from '../types';
import { generateTabId } from '../helper';
import { Transport } from './transport';

export class SharedWorkerTransport implements Transport {
    private worker: SharedWorker | null = null;
    private messageCallback: ((message: any) => void) | null = null;
    private connected: boolean = false;
    private tabId: string;
    private options: Required<SharedWorkerTransportOptions>;
    private heartbeatInterval: number | null = null;
    private pendingMessages: any[] = [];
    private connectionPromise: Promise<void> | null = null;

    constructor(
        private namespace: string,
        options: SharedWorkerTransportOptions = {}
    ) {
        this.options = {
            connectTimeout: DEFAULT_WORKER_OPTIONS.CONNECT_TIMEOUT,
            heartbeatInterval: DEFAULT_WORKER_OPTIONS.HEARTBEAT_INTERVAL,
            ...options
        };

        this.tabId = generateTabId();
    }

    async connect(): Promise<void> {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = this.establishConnection();
        return this.connectionPromise;
    }

    private async establishConnection(): Promise<void> {
        if (!this.isSupported()) {
            throw new Error('SharedWorker not supported in this browser');
        }

        return new Promise((resolve, reject) => {
            try {
                const workerUrl = this.getWorkerUrl();
                // Create worker
                this.worker = new SharedWorker(workerUrl, {
                    name: `omnitab-${this.namespace}`
                });

                this.worker.onerror = (error) => {
                    console.error('[Tab] Worker failed to load:', error);
                    console.error('[Tab] Failed URL:', workerUrl);
                };

                // Set up timeout
                const timeout = setTimeout(() => {
                    reject(new Error('SharedWorker connection timeout'));
                }, this.options.connectTimeout);

                // Handle connection
                this.worker.port.onmessage = (event: MessageEvent) => {
                    this.handleWorkerMessage(event.data);

                    // Resolve on first message (registration confirmation)
                    if (event.data.type === 'REGISTERED') {
                        clearTimeout(timeout);
                        this.connected = true;

                        // Send any pending messages
                        this.flushPendingMessages();

                        // Start heartbeat
                        this.startHeartbeat();

                        resolve();
                    }
                };

                this.worker.port.onmessageerror = (error: MessageEvent) => {
                    console.error('[Tab] Message error:', error);
                    clearTimeout(timeout);
                    reject(error);
                };

                // Start the port
                this.worker.port.start();

                // Register this tab
                this.sendToWorker({
                    type: 'REGISTER',
                    tabId: this.tabId,
                    data: {
                        tabId: this.tabId,
                        namespace: this.namespace,
                        timestamp: Date.now()
                    }
                });

            } catch (e) {
                reject(e);
            }
        });
    }

    send(message: any): void {
        if (!this.connected) {
            console.log('[Tab] Not connected, queueing message');
            // Queue for later
            this.pendingMessages.push(message);
            return;
        }

        this.sendToWorker({
            type: 'PUBLISH',
            tabId: this.tabId,
            data: {
                event: message.event,
                payload: message.payload
            }
        });
    }

    onMessage(callback: (message: any) => void): void {
        this.messageCallback = callback;
    }

    disconnect(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        if (this.connected && this.worker) {
            this.sendToWorker({
                type: 'DISCONNECT',
                tabId: this.tabId,
                data: { timestamp: Date.now() }
            });
        }

        if (this.worker) {
            this.worker.port.close();
            this.worker = null;
        }

        this.connected = false;
        this.connectionPromise = null;
        this.pendingMessages = [];
    }

    isSupported(): boolean {
        return typeof SharedWorker !== 'undefined';
    }

    private getWorkerUrl(): string {
        const workerUrl = new URL('./workers/omnitab-shared-worker.js', import.meta.url);
        return workerUrl.href;
    }

    private handleWorkerMessage(message: any): void {
        switch (message.type) {
            case 'PUBLISH':
                // Forward to app
                if (this.messageCallback) {
                    this.messageCallback({
                        type: 'PUBLISH',
                        event: message.data.event,
                        payload: message.data.payload,
                        fromTabId: message.data.fromTabId
                    });
                }
                break;

            case 'TAB_JOINED':
                console.log(`[SharedWorker] Tab joined: ${message.data.tabId}, total: ${message.data.tabCount}`);
                break;

            case 'TAB_LEFT':
                console.log(`[SharedWorker] Tab left: ${message.data.tabId}, total: ${message.data.tabCount}`);
                break;

            case 'REGISTERED':
                // Connection confirmed
                console.log('[Tab] Registration confirmed');
                this.connected = true;
                break;

            case 'PONG':
                // Heartbeat response - connection is alive
                break;

            case 'ERROR':
                console.error('[SharedWorker] Worker error:', message.data);

                if (message.data.message === 'Not registered. Send REGISTER first.') {
                    console.log('[SharedWorker] Connection lost, forcing reconnect...');
                    this.forceReconnect();
                }
                break;
        }
    }

    private async forceReconnect(): Promise<void> {
        this.connected = false;

        if (this.worker) {
            try {
                this.worker.port.close();
            } catch (e) { }
            this.worker = null;
        }

        this.connectionPromise = null;

        // Reconnect
        try {
            await this.connect();
            console.log('[SharedWorker] Reconnected successfully');

            // Resend any pending messages
            this.flushPendingMessages();
        } catch (err) {
            console.error('[SharedWorker] Reconnect failed:', err);
        }
    }

    private sendToWorker(message: any): void {
        if (this.worker) {
            try {
                this.worker.port.postMessage(message);
            } catch (e) {
                console.warn('[SharedWorker] Failed to send message', e);
            }
        }
    }

    private flushPendingMessages(): void {
        while (this.pendingMessages.length > 0) {
            const message = this.pendingMessages.shift();
            this.send(message);
        }
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = window.setInterval(() => {
            if (this.connected) {
                this.sendToWorker({
                    type: 'PING',
                    tabId: this.tabId,
                    data: { timestamp: Date.now() }
                });
            }
        }, this.options.heartbeatInterval);
    }
}