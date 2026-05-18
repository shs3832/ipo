import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const loadServiceWorker = () => {
  const listeners = new Map<string, (event: unknown) => void>();
  const shownNotifications: Array<{ title: string; options: { data?: { url?: string } } }> = [];
  const context = {
    Date,
    Promise,
    URL,
    clients: {
      matchAll: async () => [],
      openWindow: async () => undefined,
    },
    self: {
      addEventListener: (type: string, listener: (event: unknown) => void) => {
        listeners.set(type, listener);
      },
      location: {
        origin: "https://ipo.example",
      },
      registration: {
        showNotification: async (title: string, options: { data?: { url?: string } }) => {
          shownNotifications.push({ title, options });
        },
      },
    },
  };

  vm.createContext(context);
  vm.runInContext(readFileSync("public/sw.js", "utf8"), context);

  return {
    listeners,
    shownNotifications,
    self: context.self as typeof context.self & {
      toSameOriginNotificationPath: (value: string) => string;
    },
  };
};

test("service worker normalizes notification targets to same-origin paths", () => {
  const { self } = loadServiceWorker();

  assert.equal(
    self.toSameOriginNotificationPath("https://ipo.example/ipos/acme?from=push#detail"),
    "/ipos/acme?from=push#detail",
  );
  assert.equal(self.toSameOriginNotificationPath("https://evil.example/phish"), "/");
  assert.equal(self.toSameOriginNotificationPath("javascript:alert(1)"), "/");
});

test("push notifications store only same-origin navigation paths", async () => {
  const { listeners, shownNotifications } = loadServiceWorker();
  const pending: Promise<unknown>[] = [];

  listeners.get("push")?.({
    data: {
      json: () => ({
        title: "IPO alert",
        url: "https://evil.example/phish",
      }),
    },
    waitUntil: (promise: Promise<unknown>) => {
      pending.push(promise);
    },
  });

  await Promise.all(pending);

  assert.equal(shownNotifications[0]?.options.data?.url, "/");
});
