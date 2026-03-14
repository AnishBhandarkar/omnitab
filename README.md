# Omnitab

Omnitab is a lightweight, zero-dependency library that enables **real-time communication between browser tabs**. It provides a simple pub/sub API and automatically handles browser differences by using a transport **fallback chain** (SharedWorker → BroadcastChannel → StorageEvent).

> ✅ Works even when browser support is inconsistent (Safari, IE11, mobile browsers, etc.)

---

## 🔍 Why Omnitab is useful

Browser tabs are isolated from each other by default, which makes it hard to coordinate behavior across multiple tabs of the same app. Omnitab solves this by providing a unified message bus that:

- Keeps user state in sync across multiple tabs (theme, preferences, shopping cart)
- Prevents redundant work (only one tab executes polling or background jobs)
- Broadcasts events in real time (chat messages, notifications, session updates)
- Handles browser quirks automatically (fallbacks and reliability safeguards)

Omnitab is perfect for SPAs, PWAs, dashboards, and any multi-tab web app.

---

## ✨ Features (what's implemented)

- ✅ Cross-tab messaging (publish/subscribe)
- ✅ Auto-fallback transport system (SharedWorker → BroadcastChannel → StorageEvent)
- ✅ Storage safety features (TTL, size limits, full handling)
- ✅ Health checks with auto-reconnect
- ✅ Message queue with exponential backoff retry
- ✅ Tab discovery (track open tabs)
- ✅ Browser compatibility warnings
- ✅ Zero dependencies
- ✅ Full TypeScript support

---

## 📦 Installation

```bash
npm install omnitab
```

---

## 🚀 Quick Start

```ts
import { createBus } from 'omnitab';

const bus = createBus('my-app');

const unsubscribe = bus.subscribe('user:update', (payload) => {
  console.log('Received update:', payload);
});

bus.publish('user:update', { name: 'Alice' });

// later...
unsubscribe();
bus.disconnect();
```

---

## 🧠 Transport Fallback Chain (how it works)

Omnitab selects the best available transport in this order:

1. **SharedWorker** (fastest, most reliable)
2. **BroadcastChannel** (native pub/sub)
3. **StorageEvent** (universal fallback via `localStorage`)

If the chosen transport stops working (e.g., worker crash), Omnitab can optionally detect it via health checks and reconnect.

---

## 🧩 API

### `createBus(namespace: string = 'omnitab', config?: FallbackChainOptions): Bus`

Creates a message bus scoped to a `namespace`. Use different namespaces to isolate multiple apps on the same origin.

> You can pass configuration through `config`. Example:

```ts
createBus('my-app', {
  enableHealthChecks: true,
  enableMessageQueue: true,
  retryDelay: 1500,
});
```

### `publish(event: string, payload?: any): void`

Broadcasts a message to all open tabs (except the sender).

### `subscribe(event: string, handler: (payload: any) => void): () => void`

Registers a handler for an event. Returns an unsubscribe function.

### `disconnect(): void`

Disconnects and cleans up internal resources.

---

## 🧱 Configuration Options

### Core options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `namespace` | `string` | `'omnitab'` | Logical channel name to scope messages |
| `enableHealthChecks` | `boolean` | `false` | Periodically verify the transport is still alive |
| `healthCheckInterval` | `number` | `10000` | Interval (ms) between health checks |
| `enableMessageQueue` | `boolean` | `false` | Queue + retry failed sends |
| `maxRetries` | `number` | `3` | Max retry attempts per message |
| `retryDelay` | `number` | `1000` | Initial retry delay (ms) |
| `retryBackoff` | `number` | `2` | Exponential backoff multiplier |

### StorageEvent transport options (safe defaults)

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `ttl` | `number` | `5000` | Message time-to-live (ms) |
| `maxMessageSize` | `number` | `100 * 1024` | Max message size (bytes) |
| `maxMessages` | `number` | `100` | Max stored messages |
| `evictionPolicy` | `'none'  'oldest'  'error'` | `'none'` | How to behave when storage is full |
| `warnThreshold` | `number` | `0.8` | When to warn about storage usage |
| `enableMonitoring` | `boolean` | `true` | Periodic storage usage monitoring |

---

## 🧪 Browser Support (what works where)

| Browser | SharedWorker | BroadcastChannel | StorageEvent (fallback) |
| --- | --- | --- | --- |
| Chrome (desktop) | ✅ | ✅ | ✅ |
| Firefox (desktop) | ✅ | ✅ | ✅ |
| Safari (desktop) | ❌ | ✅ | ✅ |
| Mobile Safari | ❌ | ✅ | ✅ |
| Edge | ✅ | ✅ | ✅ |
| IE11 | ❌ | ❌ | ✅ |

Omnitab automatically picks the best supported transport and logs a console report on initialization.

---

## 🧪 Example Use Cases

### Shopping cart sync

Keep cart state in sync across tabs:

```ts
const bus = createBus('shop');

bus.subscribe('cart:update', (cart) => {
  renderCart(cart);
});

function updateCart(cart) {
  bus.publish('cart:update', cart);
}
```

### Theme sync (light/dark)

```ts
const bus = createBus('theme');

bus.subscribe('theme:change', (theme) => {
  document.documentElement.dataset.theme = theme;
});

function setTheme(theme) {
  bus.publish('theme:change', theme);
}
```

### React hook example

```tsx
import { useEffect } from 'react';
import { createBus } from 'omnitab';

export function useOmnitab(namespace: string) {
  useEffect(() => {
    const bus = createBus(namespace, { enableHealthChecks: true });

    const unsubscribe = bus.subscribe('app:notify', (payload) => {
      // Dispatch to app state / show toast
      console.log('notify', payload);
    });

    return () => {
      unsubscribe();
      bus.disconnect();
    };
  }, [namespace]);
}
```

---

## ✅ Contributing

Want to help make Omnitab better? Contributions are welcome!

1. Fork the repo
2. Install dependencies: `npm install`
3. Run tests: `npm run test`
4. Build: `npm run build`
5. Open a PR with a clear description of your changes

Be sure to keep the code style consistent and add tests for new functionality.

---

## 📦 Build / Dev

```bash
npm install
npm run build
npm run test
```

- `npm run build` outputs the bundle to `dist/`
- `npm run test` runs the test suite (if available)

---

## 📄 License

MIT
