const LOVABLE_PROJECT_ID = "1e794698-feca-4fca-ab3b-11990c0b270d";
const LATEST_MESSAGE_PATH = `/projects/${LOVABLE_PROJECT_ID}/latest-message`;

const warn = (() => {
  let warned = false;
  return (message: string, ...args: unknown[]) => {
    if (warned) return;
    warned = true;
    console.warn(message, ...args);
  };
})();

const createFallbackResponse = () =>
  new Response(
    JSON.stringify({
      projectId: LOVABLE_PROJECT_ID,
      message: null,
      updatedAt: null,
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    },
  );

const getRequestUrl = (input: RequestInfo | URL): string | null => {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.href;
  }
  if (typeof Request !== "undefined" && input instanceof Request) {
    return input.url;
  }
  return null;
};

const shouldIntercept = (url: string) =>
  url.startsWith("https://lovable-api.com") &&
  url.includes(LATEST_MESSAGE_PATH);

export const installLovableLatestMessageInterceptor = () => {
  if (typeof globalThis.fetch !== "function") {
    return;
  }

  const globalKey = "__lovableLatestMessagePatched";
  if ((globalThis as Record<string, unknown>)[globalKey]) {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);
  const proxyHost = import.meta.env.VITE_LOVABLE_LATEST_MESSAGE_PROXY?.replace(
    /\/$/,
    "",
  );

  const tryProxyFetch = async (url: URL, init?: RequestInit) => {
    if (!proxyHost) {
      return null;
    }

    const proxied = `${proxyHost}${url.pathname}${url.search}`;
    try {
      const response = await originalFetch(proxied, init);
      if (!response.ok) {
        warn(
          `[lovable] Latest message proxy returned ${response.status}. Falling back to direct request.`,
        );
        return null;
      }
      return response;
    } catch (error) {
      warn("[lovable] Latest message proxy failed.", error);
      return null;
    }
  };

  const tryDirectFetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response | null> => {
    try {
      const response = await originalFetch(input, init);
      if (!response.ok) {
        warn(
          `[lovable] Latest message endpoint responded with ${response.status}. Falling back to placeholder.`,
        );
        return null;
      }
      return response;
    } catch (error) {
      warn("[lovable] Latest message request failed.", error);
      return null;
    }
  };

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const urlString = getRequestUrl(input);
    if (!urlString || !shouldIntercept(urlString)) {
      return originalFetch(input, init);
    }

    const url = new URL(urlString);
    const proxiedResponse = await tryProxyFetch(url, init);
    if (proxiedResponse) {
      return proxiedResponse;
    }

    const directResponse = await tryDirectFetch(input, init);
    if (directResponse) {
      return directResponse;
    }

    warn(
      "[lovable] Unable to reach lovable-api.com latest-message endpoint. Responding with placeholder data.",
    );
    return createFallbackResponse();
  };

  (globalThis as Record<string, unknown>)[globalKey] = true;
};
