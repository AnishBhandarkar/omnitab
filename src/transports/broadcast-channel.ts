import { Transport } from './transport';

export class BroadcastChannelTransport implements Transport {
    private channel: BroadcastChannel | null = null;
    private messageCallback: ((message: any) => void) | null = null;

    constructor(private channelName: string) { }

    async connect(): Promise<void> {
        if (!this.isSupported()) {
            throw new Error('BroadcastChannel not supported');
        }
        this.channel = new BroadcastChannel(this.channelName);
        this.channel.onmessage = (event) => {
            if (this.messageCallback) {
                this.messageCallback(event.data);
            }
        };
    }

    send(message: any): void {
        if (this.channel) {
            this.channel.postMessage(message);
        }
    }

    onMessage(callback: (message: any) => void): void {
        this.messageCallback = callback;
    }

    disconnect(): void {
        if (this.channel) {
            this.channel.close();
            this.channel = null;
        }
        this.messageCallback = null;
    }

    isSupported(): boolean {
        return typeof BroadcastChannel !== 'undefined';
    }
}