import { FallbackChain } from './transports/fallback-chain';
import { generateTabId } from './utils/tabId';

export interface Bus {
    publish(event: string, payload?: any): void;
    subscribe(event: string, handler: (payload: any) => void): () => void;
}

export function createBus(namespace: string = 'omnitab'): Bus {
    const transport = new FallbackChain(namespace);
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

    // Connect automatically (could be lazy or explicit)
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
    };
}