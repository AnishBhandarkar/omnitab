import { FallbackChain } from './transports/fallback-chain';
import { generateTabId } from './helper';
import { FallbackChainOptions } from './types';

export interface Bus {
    publish(event: string, payload?: any): void;
    subscribe(event: string, handler: (payload: any) => void): () => void;
    disconnect(): void;
}

export function createBus(namespace: string = 'omnitab', config: FallbackChainOptions): Bus {
    const transport = new FallbackChain(namespace, config);
    console.log(transport);
    const tabId = generateTabId();
    const handlers = new Map<string, Set<(payload: any) => void>>();

    transport.onMessage((message) => {
        const { type, event, payload, fromTabId } = message;
        if (type === 'PUBLISH' && event && fromTabId !== tabId) {
            const eventHandlers = handlers.get(event);
            if (eventHandlers) {
                eventHandlers.forEach(handler => handler(payload));
            }
        }
    });

    // Connect automatically
    transport.connect().catch(err => {
        console.error('Omnitab failed to connect:', err);
    });

    return {
        publish(event: string, payload?: any) {
            transport.send({
                type: 'PUBLISH',
                event,
                payload,
                fromTabId: tabId,
                timestamp: Date.now(),
            });
        },

        subscribe(event: string, handler: (payload: any) => void) {
            if (!handlers.has(event)) {
                handlers.set(event, new Set());
            }
            handlers.get(event)!.add(handler);

            // Return unsubscribe function
            return () => {
                const eventHandlers = handlers.get(event);
                if (eventHandlers) {
                    eventHandlers.delete(handler);
                    if (eventHandlers.size === 0) {
                        handlers.delete(event);
                    }
                }
            };
        },

        disconnect() {
            transport.disconnect();
        }
    };
}