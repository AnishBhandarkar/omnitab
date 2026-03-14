# 🗂️ Omnitab

<div align="center">

**Real-time cross-tab communication for the browser — zero dependencies.**

[![npm version](https://img.shields.io/npm/v/omnitab.svg?style=flat-square)](https://www.npmjs.com/package/omnitab)
[![npm downloads](https://img.shields.io/npm/dm/omnitab.svg?style=flat-square)](https://www.npmjs.com/package/omnitab)
[![bundle size](https://img.shields.io/bundlephobia/minzip/omnitab?style=flat-square)](https://bundlephobia.com/package/omnitab)
[![license](https://img.shields.io/npm/l/omnitab.svg?style=flat-square)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-blue?style=flat-square)](https://www.typescriptlang.org/)

[Installation](#-installation) · [Quick Start](#-quick-start) · [API Reference](#-api-reference) · [Configuration](#-configuration-options) · [Browser Support](#-browser-support) · [Examples](#-example-use-cases)

</div>

---

## What is Omnitab?

Browser tabs are isolated from each other by default — making it hard to coordinate behavior across multiple tabs of the same app. **Omnitab** solves this with a simple pub/sub message bus that works across all open tabs, handling browser inconsistencies automatically behind the scenes.

It selects the best available transport via an **automatic fallback chain**:

```
SharedWorker  →  BroadcastChannel  →  StorageEvent (localStorage)
  (fastest)         (native)           (universal fallback)
```

No configuration required to get started. Works in Safari, IE11, and mobile browsers where native APIs may be unavailable.

---

## ✨ Features

| Feature | Description |
|---|---|
| 🔁 **Cross-tab pub/sub** | Publish events to all open tabs with a single call |
| 🔀 **Auto fallback transport** | Selects SharedWorker → BroadcastChannel → StorageEvent |
| 🛡️ **Storage safety** | TTL, size limits, and eviction policies for localStorage transport |
| 💓 **Health checks** | Periodic transport health verification with auto-reconnect |
| 📬 **Message queue** | Queued sends with exponential backoff retry on failure |
| 🔍 **Tab discovery** | Track and enumerate all open tabs |
| ⚠️ **Compat warnings** | Console report on initialization with browser capability info |
| 0️⃣ **Zero dependencies** | No external packages — lightweight and self-contained |
| 🟦 **TypeScript support** | Full type definitions included |

---

## 📦 Installation

```bash
# npm
npm install omnitab

# yarn
yarn add omnitab

# pnpm
pnpm add omnitab
```

---

## 🚀 Quick Start

```ts
import { createBus } from 'omnitab';

// Create a scoped message bus
const bus = createBus('my-app');

// Subscribe to an event
const unsubscribe = bus.subscribe('user:update', (payload) => {
  console.log('Received update:', payload);
});

// Publish to all other tabs
bus.publish('user:update', { name: 'Alice' });

// Cleanup when done
unsubscribe();
bus.disconnect();
```

That's it. Omnitab automatically picks the best transport available in the current browser.

---

## 🧠 How the Transport Fallback Chain Works

Omnitab evaluates the browser environment on initialization and selects the most capable transport:

```
┌─────────────────────────────────────────────────────────┐
│                   createBus() called                    │
└────────────────────────┬────────────────────────────────┘
                         │
              ┌──────────▼──────────┐
              │   SharedWorker      │  ✅ Fastest — shared across all tabs
              │   available?        │     of the same origin
              └──────────┬──────────┘
              No         │ Yes → use it
                         │
              ┌──────────▼──────────┐
              │  BroadcastChannel   │  ✅ Native pub/sub — no worker needed
              │   available?        │
              └──────────┬──────────┘
              No         │ Yes → use it
                         │
              ┌──────────▼──────────┐
              │   StorageEvent      │  ✅ Universal fallback via localStorage
              │   (always works)    │     Works in Safari, IE11, mobile
              └─────────────────────┘
```

If a transport fails during runtime (e.g. SharedWorker crash), Omnitab can detect this via **health checks** and reconnect or fall back gracefully.

---

## 📖 API Reference

### `createBus(namespace?, config?)`

Creates and returns a message bus scoped to a `namespace`. Use different namespaces to isolate multiple apps or features sharing the same origin.

```ts
import { createBus } from 'omnitab';

const bus = createBus('my-app', {
  enableHealthChecks: true,
  enableMessageQueue: true,
  retryDelay: 1500,
});
```

| Parameter | Type | Default | Description |
|---|---|---|---|
| `namespace` | `string` | `'omnitab'` | Scopes messages — tabs on the same namespace communicate |
| `config` | `FallbackChainOptions` | `{}` | Optional configuration (see below) |

---

### `bus.publish(event, payload?)`

Broadcasts a message to all other open tabs subscribed to `event`. **Does not fire in the sending tab.**

```ts
bus.publish('cart:update', { items: [...], total: 99.99 });
bus.publish('session:expired'); // payload is optional
```

| Parameter | Type | Description |
|---|---|---|
| `event` | `string` | Event name / channel |
| `payload` | `any` | Optional data to send with the event |

---

### `bus.subscribe(event, handler)`

Registers a handler for the given event. Returns an **unsubscribe function** to clean up the listener.

```ts
const unsubscribe = bus.subscribe('cart:update', (payload) => {
  console.log('Cart changed:', payload);
});

// Later — remove the listener
unsubscribe();
```

| Parameter | Type | Description |
|---|---|---|
| `event` | `string` | Event name to listen for |
| `handler` | `(payload: any) => void` | Callback executed when the event is received |
| **Returns** | `() => void` | Call this to unsubscribe |

---

### `bus.disconnect()`

Tears down the bus — closes the transport, clears subscriptions, and releases all resources. Always call this on component/app unmount to avoid memory leaks.

```ts
bus.disconnect();
```

---

## ⚙️ Configuration Options

Pass an options object as the second argument to `createBus()`. The config is structured into three levels: top-level bus behaviour, SharedWorker transport tuning, and StorageEvent transport tuning.

```ts
const bus = createBus('my-app', {
  // Top-level bus options
  enableHealthChecks: true,
  enableMessageQueue: true,

  // SharedWorker-specific options
  worker: {
    connectTimeout: 3000,
    heartbeatInterval: 5000,
  },

  // StorageEvent (localStorage fallback) options
  storage: {
    ttl: 8000,
    evictionPolicy: 'oldest',
    onStorageFull: (err) => console.warn('Storage full:', err),
  },
});
```

---

### `FallbackChainOptions` — Top-level

| Option | Type | Default | Description |
|---|---|---|---|
| `enableHealthChecks` | `boolean` | `false` | Periodically verify the transport is still alive |
| `healthCheckInterval` | `number` | `10000` | Interval in ms between health checks |
| `enableMessageQueue` | `boolean` | `false` | Queue and retry failed sends |
| `maxRetries` | `number` | `3` | Max retry attempts per message |
| `retryDelay` | `number` | `1000` | Initial retry delay in ms |
| `retryBackoff` | `number` | `2` | Exponential backoff multiplier per retry |
| `worker` | `SharedWorkerTransportOptions` | `{}` | SharedWorker transport settings (see below) |
| `storage` | `StorageEventTransportOptions` | `{}` | StorageEvent transport settings (see below) |

---

### `SharedWorkerTransportOptions` — `config.worker`

These options apply when Omnitab uses the **SharedWorker** transport (the default on Chrome, Firefox, and Edge).

| Option | Type | Default | Description |
|---|---|---|---|
| `connectTimeout` | `number` | — | Timeout in ms to establish a worker connection before falling back |
| `heartbeatInterval` | `number` | — | Interval in ms for worker heartbeat pings to detect silent failures |

---

### `StorageEventTransportOptions` — `config.storage`

These options apply only when the **StorageEvent (localStorage)** fallback is active — typically on Safari, mobile browsers, or IE11.

| Option | Type | Default | Description |
|---|---|---|---|
| `ttl` | `number` | `5000` | Message time-to-live in ms. Messages older than this are ignored and deleted. |
| `maxMessageSize` | `number` | `102400` | Max message size in bytes (100 KB). Prevents large messages from filling storage. |
| `maxMessages` | `number` | `100` | Max number of messages stored simultaneously. Prevents unbounded growth. |
| `evictionPolicy` | `'none' \| 'oldest' \| 'error'` | `'none'` | Behaviour when localStorage is full (see details below) |
| `onStorageFull` | `(error: StorageFullError) => void` | — | Callback fired when storage is full. Useful for custom warnings or handling. |
| `warnThreshold` | `number` | `0.8` | Fraction of estimated quota (0–1) at which a storage usage warning is logged |
| `enableMonitoring` | `boolean` | `true` | Periodically monitors storage usage against the warn threshold |

#### Eviction Policy Details

| Value | Behaviour |
|---|---|
| `'none'` | **(Safe default)** Don't evict. Fires `onStorageFull` callback and fails silently. |
| `'oldest'` | Deletes the oldest messages to make room. ⚠️ May delete messages from other tabs sharing the same namespace prefix. |
| `'error'` | Throws an error immediately without attempting to write to storage. |

---

## 🌐 Browser Support

Omnitab automatically picks the best available transport per browser. Even in the worst case (IE11), the StorageEvent fallback ensures cross-tab messaging still works.

| Browser | SharedWorker | BroadcastChannel | StorageEvent |
|---|:---:|:---:|:---:|
| Chrome (desktop) | ✅ | ✅ | ✅ |
| Firefox (desktop) | ✅ | ✅ | ✅ |
| Safari (desktop) | ❌ | ✅ | ✅ |
| Mobile Safari | ❌ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ |
| IE11 | ❌ | ❌ | ✅ |

On initialization, Omnitab logs a console report indicating which transport was selected and any browser-specific compatibility notes.

---

## 💡 Example Use Cases

### 🛒 Shopping Cart Sync

Keep cart state consistent across all open tabs — no more stale totals or conflicting item counts.

```ts
const bus = createBus('shop');

// Any tab that receives an update re-renders the cart
bus.subscribe('cart:update', (cart) => {
  renderCart(cart);
});

// Any tab that mutates the cart broadcasts the change
function updateCart(newCart) {
  saveCart(newCart);
  bus.publish('cart:update', newCart);
}
```

---

### 🌙 Theme Sync (Light / Dark Mode)

Switch themes in one tab and have all other tabs respond instantly.

```ts
const bus = createBus('ui');

bus.subscribe('theme:change', (theme) => {
  document.documentElement.dataset.theme = theme;
});

function setTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  bus.publish('theme:change', theme);
}
```

---

### 🔔 Real-time Notifications

Push notifications or alerts received in one tab (e.g. via WebSocket) out to all tabs.

```ts
const bus = createBus('notifications');

// The tab with the WebSocket connection broadcasts
websocket.onmessage = (event) => {
  const notification = JSON.parse(event.data);
  bus.publish('notification:new', notification);
};

// All tabs receive and display the notification
bus.subscribe('notification:new', (notification) => {
  showToast(notification.message);
});
```

---

### 🔐 Session / Auth Sync

Log out in one tab and immediately invalidate all other open sessions.

```ts
const bus = createBus('auth');

bus.subscribe('auth:logout', () => {
  clearLocalSession();
  window.location.href = '/login';
});

function logout() {
  clearLocalSession();
  bus.publish('auth:logout');
  window.location.href = '/login';
}
```

---

### 💓 With Health Checks & Retry

For production apps where message delivery reliability matters:

```ts
const bus = createBus('my-app', {
  // Health checks + retry
  enableHealthChecks: true,
  healthCheckInterval: 15000,   // Check every 15s
  enableMessageQueue: true,
  maxRetries: 5,
  retryDelay: 500,
  retryBackoff: 2,              // 500ms -> 1s -> 2s -> 4s -> 8s

  // Tune the SharedWorker connection
  worker: {
    connectTimeout: 3000,       // Fall back if worker doesn't connect in 3s
    heartbeatInterval: 5000,    // Ping worker every 5s to detect silent crashes
  },

  // Tune the localStorage fallback (for Safari / IE11)
  storage: {
    ttl: 8000,
    evictionPolicy: 'oldest',
    onStorageFull: (err) => {
      console.warn('Omnitab: localStorage full', err);
    },
  },
});
```
---

## 📄 License

MIT — see [LICENSE](./LICENSE) for details.

---

<div align="center">

Made with ❤️ · [npm](https://www.npmjs.com/package/omnitab) · [Report an Issue](https://github.com/AnishBhandarkar/omnitab/issues)

</div>