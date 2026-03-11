import { Transport } from './transport';
import { BroadcastChannelTransport, BroadcastChannelTransportOptions } from './broadcast-channel';
import { StorageEventTransport, StorageEventTransportOptions } from './storage-event';
import { SharedWorkerTransport, SharedWorkerTransportOptions } from './shared-worker';
// We'll add SharedWorker and Storage transports later

export interface FallbackChainOptions {
    worker?: SharedWorkerTransportOptions;
    broadcast?: BroadcastChannelTransportOptions;
    storage?: StorageEventTransportOptions;
}

export class FallbackChain implements Transport {
    private transports: Transport[] = [];
    private activeTransport: Transport | null = null;
    private messageCallback: ((message: any) => void) | null = null;

    constructor(private namespace: string,
        private options: FallbackChainOptions = {}) {
        // Order by preference: best first
        this.transports = [
            new SharedWorkerTransport(namespace, options.worker),
            new BroadcastChannelTransport(namespace, options.broadcast),
            new StorageEventTransport(namespace, options.storage),
        ].filter(t => t.isSupported());
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
                return;
            } catch (err) {
                console.warn(`Omnitab: ${transport.constructor.name} failed`, err);
                // Continue to next transport
            }
        }
        throw new Error('No transport available');
    }

    send(message: any): void {
        if (this.activeTransport) {
            this.activeTransport.send(message);
        } else {
            console.warn('Omnitab: not connected, cannot send');
        }
    }

    onMessage(callback: (message: any) => void): void {
        this.messageCallback = callback;
    }

    disconnect(): void {
        if (this.activeTransport) {
            this.activeTransport.disconnect();
            this.activeTransport = null;
        }
        this.messageCallback = null;
    }

    isSupported(): boolean {
        return this.transports.length > 0;
    }
}