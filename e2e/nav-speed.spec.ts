import { expect, test, type Page } from "@playwright/test";

const tabs = [
  { name: "Home", href: "/" },
  { name: "Chiller", href: "/chiller" },
  { name: "Analytics", href: "/insights" },
  { name: "Family", href: "/family" },
];

async function throttle(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

async function openShell(page: Page) {
    await page.goto("/shell-check", { waitUntil: "networkidle" });
}

test("tab switches on a slow phone", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP network throttle needs Chromium");
  await throttle(page);
  const lines: string[] = [];
  for (const tab of tabs) {
    await openShell(page);
    const link = page.getByRole("navigation").getByRole("link", { name: tab.name });
    let requests = 0;
    const onRequest = (request: { headers: () => Record<string, string> }) => {
      const headers = request.headers();
      if (headers.rsc === "1" || headers["next-router-prefetch"] === "1") requests += 1;
    };
    page.on("request", onRequest);
    const started = Date.now();
    await link.dispatchEvent("pointerdown");
    await expect(link).toHaveAttribute("data-current", "true");
    const highlight = Date.now() - started;
    await link.click({ noWaitAfter: true });
    await page.waitForURL((url) => url.pathname === tab.href || url.pathname === "/login", { timeout: 20000 });
    const arrived = Date.now() - started;
    page.off("request", onRequest);
    const line = `${tab.name} highlight ${highlight}ms arrived ${arrived}ms rsc ${requests}`;
    console.log(line);
    lines.push(line);
    expect(highlight).toBeLessThan(250);
    expect(arrived).toBeLessThan(250);
  }
});
