const LOVABLE_SOCKET_HOST_SUFFIX = ".lovableproject.com";
const LOVABLE_SOCKET_REASON =
  "Lovable collaborative socket disabled for public deployments.";

const resolveUrlString = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }

  if (typeof URL !== "undefined" && value instanceof URL) {
    return value.href;
  }

  return null;
};

const isLovableSocketUrl = (value: unknown): string | null => {
  const urlString = resolveUrlString(value);
  if (!urlString) {
    return null;
  }

  try {
    const base =
      typeof location !== "undefined" && location.href
        ? location.href
        : "https://lovable.dev";
    const url = new URL(urlString, base);

    if (url.protocol !== "wss:") {
      return null;
    }

    if (!url.host.endsWith(LOVABLE_SOCKET_HOST_SUFFIX)) {
      return null;
    }

    // The Lovable live collaboration socket lives at the root path.
    if (url.pathname && url.pathname !== "/") {
      return null;
    }

    return url.href;
  } catch (_error) {
    return null;
  }
};

const createCloseEvent = (): CloseEvent => {
  if (typeof CloseEvent === "function") {
    return new CloseEvent("close", {
      wasClean: true,
      code: 1000,
      reason: LOVABLE_SOCKET_REASON,
    });
  }

  const fallback = new Event("close") as CloseEvent;
  Object.defineProperties(fallback, {
    wasClean: { value: true },
    code: { value: 1000 },
    reason: { value: LOVABLE_SOCKET_REASON },
  });
  return fallback;
};

const createErrorEvent = () => new Event("error");

class DisabledLovableSocket extends EventTarget implements WebSocket {
  readonly url: string;
  binaryType: BinaryType = "blob";
  readonly bufferedAmount = 0;
  readonly extensions = "";
  readonly protocol = "";
  readyState: number;
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null;
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent<unknown>) => unknown) | null =
    null;
  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null;

  constructor(
    url: string,
    private readonly realConstructor: typeof WebSocket,
  ) {
    super();
    this.url = url;
    this.readyState = realConstructor.CLOSED;

    queueMicrotask(() => {
      const errorEvent = createErrorEvent();
      this.dispatchEvent(errorEvent);
      if (this.onerror) {
        this.onerror.call(this as unknown as WebSocket, errorEvent);
      }

      const closeEvent = createCloseEvent();
      this.dispatchEvent(closeEvent);
      if (this.onclose) {
        this.onclose.call(this as unknown as WebSocket, closeEvent);
      }
    });
  }

  send(): void {
    console.warn(
      `[lovable] Ignored message sent to disabled collaboration socket (${this.url}).`,
    );
  }

  close(): void {
    if (this.readyState === this.realConstructor.CLOSED) {
      return;
    }

    this.readyState = this.realConstructor.CLOSED;
    const closeEvent = createCloseEvent();
    this.dispatchEvent(closeEvent);
    if (this.onclose) {
      this.onclose.call(this as unknown as WebSocket, closeEvent);
    }
  }

  addEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: ((this: WebSocket, ev: WebSocketEventMap[K]) => unknown) | null,
    options?: boolean | AddEventListenerOptions,
  ): void {
    if (!listener) {
      return;
    }
    super.addEventListener(type, listener as EventListener, options);
  }

  removeEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: ((this: WebSocket, ev: WebSocketEventMap[K]) => unknown) | null,
    options?: boolean | EventListenerOptions,
  ): void {
    if (!listener) {
      return;
    }
    super.removeEventListener(type, listener as EventListener, options);
  }

  dispatchEvent(event: Event): boolean {
    return super.dispatchEvent(event);
  }
}

const INSTALL_KEY = "__lovableSocketGuardInstalled";

export const installLovableSocketGuard = () => {
  const globalScope = globalThis as typeof globalThis & {
    [INSTALL_KEY]?: boolean;
  };

  if (typeof globalScope.WebSocket !== "function") {
    return;
  }

  if (globalScope[INSTALL_KEY]) {
    return;
  }

  const NativeWebSocket = globalScope.WebSocket;

  const isPrototypeFrozen =
    Object.isFrozen?.(NativeWebSocket.prototype) ?? false;

  if (isPrototypeFrozen) {
    console.warn(
      "[lovable] WebSocket prototype is frozen — skipping collaboration socket guard installation.",
    );
    globalScope[INSTALL_KEY] = true;
    return;
  }

  const WebSocketProxy = new Proxy(NativeWebSocket, {
    construct(target, args, newTarget) {
      const [url] = args;
      const interceptedUrl = isLovableSocketUrl(url);
      if (interceptedUrl) {
        console.info(
          `[lovable] Disabled collaboration socket attempt towards ${interceptedUrl}.`,
        );
        return new DisabledLovableSocket(interceptedUrl, NativeWebSocket);
      }

      return Reflect.construct(target, args, newTarget);
    },
  });

  Object.defineProperties(WebSocketProxy, {
    CONNECTING: { value: NativeWebSocket.CONNECTING },
    OPEN: { value: NativeWebSocket.OPEN },
    CLOSING: { value: NativeWebSocket.CLOSING },
    CLOSED: { value: NativeWebSocket.CLOSED },
  });

  const nativePrototypeDescriptor = Object.getOwnPropertyDescriptor(
    NativeWebSocket,
    "prototype",
  );
  const proxyPrototypeDescriptor = Object.getOwnPropertyDescriptor(
    WebSocketProxy,
    "prototype",
  );

  const isPrototypeWritable = (descriptor: PropertyDescriptor | undefined) => {
    if (!descriptor) {
      return true;
    }

    if (Object.prototype.hasOwnProperty.call(descriptor, "writable")) {
      return descriptor.writable !== false;
    }

    return !!descriptor.set;
  };

  if (
    isPrototypeWritable(nativePrototypeDescriptor) &&
    isPrototypeWritable(proxyPrototypeDescriptor)
  ) {
    WebSocketProxy.prototype = NativeWebSocket.prototype;
  } else {
    console.warn(
      "[lovable] WebSocket prototype is not writable — skipping collaboration socket guard prototype reassignment.",
    );
  }

  globalScope.WebSocket = WebSocketProxy as typeof WebSocket;
  globalScope[INSTALL_KEY] = true;
};
