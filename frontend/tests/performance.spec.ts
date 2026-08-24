import { expect, test } from "@playwright/test";

test.describe("Core Web Vitals release budget", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "Chromium provides the lab performance APIs used by this gate");

  test("homepage stays within launch performance thresholds", async ({ page }) => {
    await page.addInitScript(() => {
      const state = { cls: 0, lcp: 0, lcpElement: "", lcpUrl: "" };
      Object.defineProperty(window, "__storesyncVitals", { value: state });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { element?: Element; url?: string }>) {
          state.lcp = entry.startTime;
          state.lcpElement = entry.element
            ? `${entry.element.tagName.toLowerCase()}.${String(entry.element.className)}`
            : "unknown";
          state.lcpUrl = entry.url || "";
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) state.cls += entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });

    await page.goto("/", { waitUntil: "load" });
    await page.locator(".hero-main img").waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const image = document.querySelector<HTMLImageElement>(".hero-main img");
      return Boolean(image?.complete && image.naturalWidth > 0);
    });
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() =>
      (window as unknown as { __storesyncVitals: { cls: number; lcp: number; lcpElement: string; lcpUrl: string } }).__storesyncVitals,
    );
    expect(metrics.lcp, "lab LCP in milliseconds").toBeGreaterThan(0);
    expect(metrics.lcp, `lab LCP must meet the 2.5 second launch target (${metrics.lcpElement} ${metrics.lcpUrl})`).toBeLessThanOrEqual(2_500);
    expect(metrics.cls, "CLS must meet the 0.1 launch target").toBeLessThanOrEqual(0.1);

    const interactionMs = await page.evaluate(async () => {
      const controls = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".category-trigger, .mobile-menu"),
      );
      const control = controls.find((candidate) => candidate.offsetParent !== null);
      if (!control) throw new Error("No visible navigation control found");
      const start = performance.now();
      control.click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      return performance.now() - start;
    });
    expect(interactionMs, "two-frame interaction latency must meet the 200ms INP lab proxy").toBeLessThanOrEqual(200);
  });
});
