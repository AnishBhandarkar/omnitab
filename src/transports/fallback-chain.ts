import { Transport } from './transport';
import { BroadcastChannelTransport } from './broadcast-channel';
import { StorageEventTransport } from './storage-event';
// We'll add SharedWorker and Storage transports later

export class FallbackChain implements Transport {
    private transports: Transport[] = [];
    private activeTransport: Transport | null = null;
    private messageCallback: ((message: any) => void) | null = null;

    constructor(channelName: string) {
        // Order by preference: best first
        // TODO: Add SharedWorkerTransport when implemented
        // TODO: Add StorageEventTransport when implemented
        this.transports = [
            // new SharedWorkerTransport(channelName), // Future
            new BroadcastChannelTransport(channelName),
            new StorageEventTransport(channelName)
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