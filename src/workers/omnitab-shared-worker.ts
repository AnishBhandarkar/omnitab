/// <reference lib="webworker" />

import { ConnectedTab } from "../types";

declare const self: SharedWorkerGlobalScope;
export { };

const tabs = new Map<string, ConnectedTab>();
const handlers: Map<string, (message: any, sender: ConnectedTab) => void> = new Map();

// Message Handlers

handlers.set('REGISTER', (message, sender) => {
    const { tabId } = message.data;

    tabs.set(tabId, {
        port: sender.port,
        tabId,
        connectedAt: Date.now(),
        lastPing: Date.now()
    });

    sender.port.postMessage({
        type: 'REGISTERED',
        data: {
            tabId,
            tabCount: tabs.size
        }
    });

    broadcastToAll({
        type: 'TAB_JOINED',
        data: {
            tabId,
            tabCount: tabs.size
        }
    }, tabId);
});


handlers.set('PUBLISH', (message, sender) => {
    const { event, payload } = message.data;

    broadcastToAll({
        type: 'PUBLISH',
        data: {
            event,
            payload,
            fromTabId: sender.tabId
        }
    }, sender.tabId);
});


handlers.set('PING', (message, sender) => {
    const tab = tabs.get(sender.tabId);
    if (tab) {
        tab.lastPing = Date.now();
    }

    sender.port.postMessage({
        type: 'PONG',
        data: { timestamp: Date.now() }
    });
});


handlers.set('DISCONNECT', (message, sender) => {
    handleTabDisconnect(sender.tabId);
});



// Connection Handling

self.onconnect = (event: MessageEvent) => {
    const port = event.ports[0];

    port.onmessage = (event: MessageEvent) => {
        handleMessage(event.data, port);
    };

    port.start();
};


function handleMessage(message: any, port: MessagePort) {
    const { type, tabId, data } = message;

    let tab = tabs.get(tabId);

    if (!tab && type !== 'REGISTER') {
        port.postMessage({
            type: 'ERROR',
            data: { message: 'Not registered. Send REGISTER first.' }
        });
        return;
    }

    if (!tab) {
        tab = {
            port,
            tabId,
            connectedAt: Date.now(),
            lastPing: Date.now()
        };
    }

    const handler = handlers.get(type);
    if (handler) {
        handler({ type, fromTabId: tabId, data, timestamp: Date.now() }, tab);
    }
}



// Utilities

function broadcastToAll(message: any, excludeTabId?: string) {
    tabs.forEach((tab, tabId) => {
        if (tabId !== excludeTabId) {
            try {
                tab.port.postMessage(message);
            } catch {
                handleTabDisconnect(tabId);
            }
        }
    });
}


function handleTabDisconnect(tabId: string) {
    const removed = tabs.delete(tabId);

    if (removed) {
        broadcastToAll({
            type: 'TAB_LEFT',
            data: {
                tabId,
                tabCount: tabs.size
            }
        });
    }
}



// Maintenance
setInterval(() => {
    const now = Date.now();
    const STALE_TIMEOUT = 30000;

    tabs.forEach((tab, tabId) => {
        if (now - tab.lastPing > STALE_TIMEOUT) {
            handleTabDisconnect(tabId);
        }
    });
}, 10000);


// Init
console.log('[SharedWorker] Omnitab SharedWorker started');