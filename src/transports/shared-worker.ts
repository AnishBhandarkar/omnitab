import { Transport } from './transport';

export interface SharedWorkerTransportOptions {
    /** Timeout for worker connection in ms */
    connectTimeout?: number;

    /** Enable leader election */
    enableLeaderElection?: boolean;

    /** Callback when leader changes */
    onLeaderChange?: (leaderId: string | null) => void;

    /** Heartbeat interval in ms */
    heartbeatInterval?: number;
}

export class SharedWorkerTransport implements Transport {
    private worker: SharedWorker | null = null;
    private messageCallback: ((message: any) => void) | null = null;
    private connected: boolean = false;
    private tabId: string;
    private options: Required<SharedWorkerTransportOptions>;

    // Heartbeat
    private heartbeatInterval: number | null = null;
    private lastHeartbeat: number = 0;

    // Leader election
    private isLeader: boolean = false;
    private currentLeader: string | null = null;

    // Pending messages while connecting
    private pendingMessages: any[] = [];

    // Connection promise
    private connectionPromise: Promise<void> | null = null;

    constructor(
        private namespace: string,
        options: SharedWorkerTransportOptions = {}
    ) {
        this.options = {
            connectTimeout: 5000,
            enableLeaderElection: true,
            onLeaderChange: () => { },
            heartbeatInterval: 5000,
            ...options
        };

        this.tabId = this.generateTabId();
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
        this.isLeader = false;
        this.currentLeader = null;
        this.pendingMessages = [];
    }

    isSupported(): boolean {
        return typeof SharedWorker !== 'undefined';
    }

    /**
     * Check if this tab is the leader
     */
    isLeaderTab(): boolean {
        return this.isLeader;
    }

    /**
     * Get current leader tab ID
     */
    getCurrentLeader(): string | null {
        return this.currentLeader;
    }

    /**
     * Request leader election (if not already leader)
     */
    requestLeaderElection(): void {
        if (!this.options.enableLeaderElection) return;

        this.sendToWorker({
            type: 'LEADER_ELECTION',
            tabId: this.tabId,
            data: {
                voteFor: this.tabId,
                timestamp: Date.now()
            }
        });
    }

    /**
     * Get the worker script URL
     * This depends on how you bundle the worker
     */
    private getWorkerUrl(): string {
        // THIS IS THE KEY: import.meta.url gives us the current file's location
        // We know our worker is in '../workers/omnitab-shared-worker.js' relative to this file
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

            case 'LEADER_ELECTED':
                this.currentLeader = message.data.leader;
                this.isLeader = (this.currentLeader === this.tabId);
                this.options.onLeaderChange(this.currentLeader);

                console.log(`[SharedWorker] Leader ${this.isLeader ? 'elected (this tab)' : 'elected'}: ${this.currentLeader}`);
                break;

            case 'LEADER_ELECTION_NEEDED':
                // Start election if we're the oldest tab or random
                if (this.options.enableLeaderElection && !this.isLeader) {
                    // Simple election: first to respond becomes leader
                    // In production, you'd want a proper algorithm
                    setTimeout(() => {
                        this.requestLeaderElection();
                    }, Math.random() * 100); // Random delay to avoid collisions
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
                this.currentLeader = message.data.leader;
                this.isLeader = (this.currentLeader === this.tabId);
                break;

            case 'PONG':
                this.lastHeartbeat = Date.now();
                break;

            case 'ERROR':
                console.error('[SharedWorker] Worker error:', message.data);
                break;
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

                // If leader, send heartbeat
                if (this.isLeader) {
                    this.sendToWorker({
                        type: 'LEADER_HEARTBEAT',
                        tabId: this.tabId,
                        data: { timestamp: Date.now() }
                    });
                }
            }
        }, this.options.heartbeatInterval);
    }

    private generateTabId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 10);
        const unique = crypto.randomUUID?.().split('-')[0] || random;
        return `${timestamp}-${random}-${unique}`;
    }
}