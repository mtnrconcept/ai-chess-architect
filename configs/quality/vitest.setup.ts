import WebSocket from "ws";

// Supabase Realtime requires a WebSocket constructor as soon as a client is
// created. Node 22 exposes one natively; keep the suite runnable on older CI
// images (including local Node 20 containers) without changing browser code.
if (typeof globalThis.WebSocket === "undefined") {
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value: WebSocket,
    writable: true,
  });
}
