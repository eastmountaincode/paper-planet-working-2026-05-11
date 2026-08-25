import { expect, test } from "@playwright/test";

test.describe("standalone frame demos", () => {
  test("streams only the requested byte range", async ({ request }) => {
    const response = await request.get(
      "/api/tools/frame-demo/home-landscape",
      { headers: { Range: "bytes=0-1023" } },
    );

    expect(response.status()).toBe(206);
    expect(response.headers()["accept-ranges"]).toBe("bytes");
    expect(response.headers()["content-length"]).toBe("1024");
    expect(response.headers()["content-range"]).toMatch(
      /^bytes 0-1023\/\d+$/,
    );
    expect((await response.body()).byteLength).toBe(1024);
  });

  test("Home is a control-free landscape video", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tools/frame-demo/home");

    const demo = page.locator("main[data-demo='home']");
    const video = page.locator("video");

    await expect(demo).toHaveAttribute("data-source", "home-landscape");
    await expect(video).toBeVisible();
    await expect(video).not.toHaveAttribute("controls", "");
    await expect(demo.getByRole("button")).toHaveCount(0);
    await expect(demo).toHaveText("");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute(
      "content",
      /viewport-fit=cover/,
    );
  });

  test("Green Room exposes the 0.75 to 0.80 handoff gap", async ({ page }) => {
    await page.setViewportSize({ width: 750, height: 1000 });
    await page.goto("/tools/frame-demo/green-room");

    const demo = page.locator("main[data-demo='green-room']");

    await expect(demo).toHaveAttribute("data-source", "green-portrait");
    await expect(demo).toHaveAttribute("data-safe-zone-visible", "true");

    await page.setViewportSize({ width: 760, height: 1000 });
    await expect(demo).toHaveAttribute("data-source", "green-landscape");
    await expect(demo).toHaveAttribute("data-safe-zone-visible", "false");

    await page.setViewportSize({ width: 800, height: 1000 });
    await expect(demo).toHaveAttribute("data-source", "green-landscape");
    await expect(demo).toHaveAttribute("data-safe-zone-visible", "true");
  });

  test("full-bleed mode boots at the mobile viewport height", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 460, height: 1000 });
    await page.goto("/tools/frame-demo/full-bleed");

    const demo = page.locator("main[data-demo='full-bleed']");
    const panSurface = page.locator("[data-pan-surface='true']");
    const video = page.locator("video");

    await expect(demo).toHaveAttribute("data-pan-enabled", "true");
    await expect(demo).toHaveAttribute("data-viewport-height", "large");
    await expect(video).toBeVisible();
    await expect(video).toHaveAttribute(
      "poster",
      "/tools/frame-demo/home-landscape-poster.webp",
    );

    const geometry = await page.evaluate(() => {
      const main = document.querySelector("main")?.getBoundingClientRect();
      const pan = document
        .querySelector("[data-pan-surface='true']")
        ?.getBoundingClientRect();
      const video = document.querySelector("video")?.getBoundingClientRect();

      return {
        main: main ? { height: main.height, width: main.width } : null,
        pan: pan ? { height: pan.height, width: pan.width } : null,
        video: video ? { height: video.height, width: video.width } : null,
      };
    });

    expect(geometry.main).toEqual({ height: 1000, width: 460 });
    expect(geometry.pan).toEqual({ height: 1000, width: 460 });
    expect(geometry.video?.height).toBeCloseTo(1000, 0);
    expect(geometry.video?.width).toBeCloseTo(1600, 0);

    await expect
      .poll(() =>
        panSurface.evaluate((element) => ({
          scrollLeft: element.scrollLeft,
          scrollWidth: element.scrollWidth,
        })),
      )
      .toEqual({ scrollLeft: 570, scrollWidth: 1600 });
  });

  test("touch mode uses a scene-backed natural document for browser chrome", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: "http://localhost:3000",
      hasTouch: true,
      viewport: { height: 1000, width: 460 },
    });
    const page = await context.newPage();

    await page.goto("/tools/frame-demo/full-bleed");

    const demo = page.locator("main[data-demo='full-bleed']");

    await expect(demo).toHaveAttribute("data-viewport-height", "large");
    await expect(
      page.locator("[data-browser-chrome-scroll-tail='true']"),
    ).toBeVisible();

    const scrollState = await page.evaluate(() => {
      const demo = document.querySelector("main[data-demo='full-bleed']");
      const panSurface = document.querySelector(
        "[data-pan-surface='true']",
      );
      const scrollTail = document.querySelector(
        "[data-browser-chrome-scroll-tail='true']",
      );

      return {
        bodyOverflowY: getComputedStyle(document.body).overflowY,
        bodyBackgroundColor: getComputedStyle(document.body).backgroundColor,
        bodyBackgroundImage: getComputedStyle(document.body).backgroundImage,
        documentOverflowY: getComputedStyle(
          document.documentElement,
        ).overflowY,
        documentBackgroundColor: getComputedStyle(
          document.documentElement,
        ).backgroundColor,
        documentBackgroundImage: getComputedStyle(
          document.documentElement,
        ).backgroundImage,
        isRootScroller:
          document.scrollingElement === document.documentElement,
        stageHeight: demo ? getComputedStyle(demo).height : null,
        stagePosition: demo ? getComputedStyle(demo).position : null,
        scrollHeight: document.scrollingElement?.scrollHeight,
        tailBackgroundImage: scrollTail
          ? getComputedStyle(scrollTail).backgroundImage
          : null,
        touchAction: panSurface
          ? getComputedStyle(panSurface).touchAction
          : null,
        viewportHeight: window.innerHeight,
      };
    });

    expect(scrollState.bodyOverflowY).toBe("auto");
    expect(scrollState.documentOverflowY).toBe("auto");
    expect(scrollState.bodyBackgroundColor).toBe("rgb(113, 137, 145)");
    expect(scrollState.documentBackgroundColor).toBe("rgb(113, 137, 145)");
    expect(scrollState.bodyBackgroundImage).toContain(
      "home-landscape-poster.webp",
    );
    expect(scrollState.documentBackgroundImage).toContain(
      "home-landscape-poster.webp",
    );
    expect(scrollState.isRootScroller).toBe(true);
    expect(scrollState.stageHeight).toBe("1000px");
    expect(scrollState.stagePosition).toBe("relative");
    expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.viewportHeight);
    expect(scrollState.tailBackgroundImage).toContain(
      "home-landscape-poster.webp",
    );
    expect(scrollState.touchAction).toContain("pan-x");
    expect(scrollState.touchAction).toContain("pan-y");

    await page.evaluate(() => window.scrollTo(0, 1));

    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(1);

    const naturalStage = await demo.evaluate((element) => {
      const rect = element.getBoundingClientRect();

      return { height: rect.height, top: rect.top };
    });

    expect(naturalStage.height).toBe(1000);
    expect(naturalStage.top).toBe(-1);

    await context.close();
  });

  test("single-video mode reports only attainable visible source frames", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/tools/frame-demo/full-bleed");

    const demo = page.locator("main[data-demo='full-bleed']");
    const panSurface = page.locator("[data-pan-surface='true']");
    const safeZone = page.locator("[data-safe-zone='true']");
    const minimumSafeZone = page.locator("[data-minimum-safe-zone='true']");

    await expect(demo).toHaveAttribute("data-source", "home-landscape");
    await expect(demo).toHaveAttribute("data-pan-enabled", "false");
    await expect(demo).toHaveAttribute("data-viewport-height", "large");
    await expect(demo).toHaveAttribute(
      "data-layout-mode",
      "visible-source-frame",
    );
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "1728");
    await expect(demo).toHaveAttribute("data-safe-zone-source-height", "1080");
    await expect(demo).toHaveAttribute("data-supported", "true");
    await expect(safeZone).toHaveText("1728 × 1080");

    await expect(minimumSafeZone).toHaveAttribute("data-source-width", "497");
    await expect(minimumSafeZone).toHaveAttribute("data-source-height", "1080");
    await expect(minimumSafeZone).toHaveText("497 × 1080");
    await expect(page.getByText(/Minimum width/i)).toHaveCount(0);

    const getSafeZoneGeometry = () =>
      page.evaluate(() => {
        const video = document.querySelector("video")?.getBoundingClientRect();
        const safeZone = document
          .querySelector("[data-safe-zone='true']")
          ?.getBoundingClientRect();
        const minimumSafeZone = document
          .querySelector("[data-minimum-safe-zone='true']")
          ?.getBoundingClientRect();

        const toGeometry = (rect?: DOMRect) =>
          rect
            ? {
                height: rect.height,
                left: rect.left,
                top: rect.top,
                width: rect.width,
              }
            : null;

        return {
          minimumSafeZone: toGeometry(minimumSafeZone),
          safeZone: toGeometry(safeZone),
          video: toGeometry(video),
        };
      });

    const desktopGeometry = await getSafeZoneGeometry();

    const fullBleedViewport = await demo.evaluate((element) => {
      const rect = element.getBoundingClientRect();

      return {
        height: rect.height,
        supportsDynamicViewport: CSS.supports("height", "100dvh"),
        width: rect.width,
      };
    });

    expect(fullBleedViewport.supportsDynamicViewport).toBe(true);
    expect(fullBleedViewport.width).toBeCloseTo(1600, 0);
    expect(fullBleedViewport.height).toBeCloseTo(1000, 0);

    expect(desktopGeometry.video?.width).toBeCloseTo(1600, 0);
    expect(desktopGeometry.video?.height).toBeCloseTo(1000, 0);
    expect(desktopGeometry.safeZone?.width).toBeCloseTo(1600, 0);
    expect(desktopGeometry.safeZone?.height).toBeCloseTo(1000, 0);
    expect(desktopGeometry.safeZone?.left).toBeCloseTo(0, 0);
    expect(desktopGeometry.safeZone?.top).toBeCloseTo(0, 0);
    expect(desktopGeometry.minimumSafeZone?.width).toBeCloseTo(460, 0);
    expect(desktopGeometry.minimumSafeZone?.height).toBeCloseTo(1000, 0);
    expect(desktopGeometry.minimumSafeZone?.left).toBeCloseTo(570, 0);
    expect(desktopGeometry.minimumSafeZone?.top).toBeCloseTo(0, 0);

    await page.setViewportSize({ width: 760, height: 1000 });
    await expect(demo).toHaveAttribute("data-pan-enabled", "true");
    await expect(demo).toHaveAttribute(
      "data-layout-mode",
      "visible-source-frame",
    );
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "821");
    await expect(demo).toHaveAttribute("data-safe-zone-source-height", "1080");
    await expect(demo).toHaveAttribute("data-safe-zone-visible", "true");
    await expect(safeZone).toHaveText("821 × 1080");

    const geometry = await getSafeZoneGeometry();

    expect(geometry.video?.width).toBeCloseTo(1600, 0);
    expect(geometry.video?.height).toBeCloseTo(1000, 0);
    expect(geometry.video?.top).toBeCloseTo(0, 0);
    expect(geometry.minimumSafeZone?.width).toBeCloseTo(460, 0);
    expect(geometry.minimumSafeZone?.height).toBeCloseTo(1000, 0);
    expect(geometry.minimumSafeZone?.left).toBeCloseTo(150, 0);
    expect(geometry.minimumSafeZone?.top).toBeCloseTo(0, 0);
    expect(geometry.safeZone?.width).toBeCloseTo(760, 0);
    expect(geometry.safeZone?.height).toBeCloseTo(1000, 0);
    expect(geometry.safeZone?.left).toBeCloseTo(0, 0);
    expect(geometry.safeZone?.top).toBeCloseTo(0, 0);

    const centeredPan = await panSurface.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollLeft: element.scrollLeft,
      scrollWidth: element.scrollWidth,
    }));

    expect(centeredPan.clientWidth).toBeCloseTo(760, 0);
    expect(centeredPan.scrollWidth).toBeCloseTo(1600, 0);
    expect(centeredPan.scrollLeft).toBeCloseTo(420, 0);

    await panSurface.evaluate((element) => {
      element.scrollLeft = 0;
    });

    await expect
      .poll(() => panSurface.evaluate((element) => element.scrollLeft))
      .toBeCloseTo(0, 0);

    const pannedVideoLeft = await page
      .locator("video")
      .evaluate((video) => video.getBoundingClientRect().left);

    expect(pannedVideoLeft).toBeCloseTo(0, 0);

    await page.setViewportSize({ width: 460, height: 1000 });
    await expect(demo).toHaveAttribute("data-supported", "true");
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "497");
    await expect(demo).toHaveAttribute("data-safe-zone-source-height", "1080");
    await expect(safeZone).toHaveText("497 × 1080");

    const currentMinimumGeometry = await page.evaluate(() => {
      const current = document
        .querySelector("[data-safe-zone='true']")
        ?.getBoundingClientRect();
      const minimum = document
        .querySelector("[data-minimum-safe-zone='true']")
        ?.getBoundingClientRect();

      return {
        currentLeft: current?.left,
        currentWidth: current?.width,
        minimumLeft: minimum?.left,
        minimumWidth: minimum?.width,
      };
    });

    expect(currentMinimumGeometry.currentLeft).toBeCloseTo(0, 0);
    expect(currentMinimumGeometry.currentWidth).toBeCloseTo(460, 0);
    expect(currentMinimumGeometry.minimumLeft).toBeCloseTo(0, 0);
    expect(currentMinimumGeometry.minimumWidth).toBeCloseTo(460, 0);

    await page.setViewportSize({ width: 2000, height: 1000 });
    await expect(demo).toHaveAttribute("data-pan-enabled", "false");
    await expect(demo).toHaveAttribute("data-supported", "true");
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "1728");
    await expect(demo).toHaveAttribute("data-safe-zone-source-height", "864");
    await expect(safeZone).toHaveText("1728 × 864");

    await page.setViewportSize({ width: 450, height: 1000 });
    await expect(demo).toHaveAttribute("data-supported", "false");
    await expect(page.locator("[data-safe-zone='true']")).toHaveClass(
      /border-red-400/,
    );
  });
});
