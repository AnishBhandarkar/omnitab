// src/transports/broadcast-channel.ts

import { Transport } from "./transport";

/**
 * Options for BroadcastChannel transport
 * 
 * BroadcastChannel is the simplest transport with few config options,
 * but we still define an interface for consistency with other transports
 * and future extensibility.
 */
export interface BroadcastChannelTransportOptions {
    /**
     * Whether to log debug information
     * @default false
     */
    debug?: boolean;
}

export class BroadcastChannelTransport implements Transport {
    private channel: BroadcastChannel | null = null;
    private messageCallback: ((message: any) => void) | null = null;
    private options: Required<BroadcastChannelTransportOptions>;

    constructor(
        private namespace: string,
        options: BroadcastChannelTransportOptions = {}
    ) {
        this.options = {
            debug: false,
            ...options
        };
    }

    async connect(): Promise<void> {
        if (!this.isSupported()) {
            throw new Error('BroadcastChannel not supported');
        }

        this.channel = new BroadcastChannel(this.namespace);

        if (this.options.debug) {
            console.log(`[BroadcastChannel] Connected to channel: ${this.namespace}`);
        }

        this.channel.onmessage = (event) => {
            if (this.messageCallback) {
                this.messageCallback(event.data);
            }
        };
    }

    send(message: any): void {
        if (this.channel) {
            this.channel.postMessage(message);

            if (this.options.debug) {
                console.log(`[BroadcastChannel] Sent:`, message);
            }
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

        if (this.options.debug) {
            console.log(`[BroadcastChannel] Disconnected`);
        }
    }

    isSupported(): boolean {
        return typeof BroadcastChannel !== 'undefined';
    }
}