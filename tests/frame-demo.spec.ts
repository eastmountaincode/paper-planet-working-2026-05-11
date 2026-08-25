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
    await expect(demo).toHaveAttribute("data-viewport-height", "screen");
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

    await expect(demo).toHaveAttribute("data-viewport-height", "screen");
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
        stageBackgroundColor: demo
          ? getComputedStyle(demo).backgroundColor
          : null,
        stageBackgroundImage: demo
          ? getComputedStyle(demo).backgroundImage
          : null,
        stagePosition: demo ? getComputedStyle(demo).position : null,
        scrollHeight: document.scrollingElement?.scrollHeight,
        tailBackgroundImage: scrollTail
          ? getComputedStyle(scrollTail).backgroundImage
          : null,
        overscrollBehaviorX: panSurface
          ? getComputedStyle(panSurface).overscrollBehaviorX
          : null,
        panBackgroundColor: panSurface
          ? getComputedStyle(panSurface).backgroundColor
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
    expect(scrollState.stageBackgroundColor).toBe("rgb(113, 137, 145)");
    expect(scrollState.stageBackgroundImage).toContain(
      "home-landscape-poster.webp",
    );
    expect(scrollState.stagePosition).toBe("relative");
    expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.viewportHeight);
    expect(scrollState.tailBackgroundImage).toContain(
      "home-landscape-poster.webp",
    );
    expect(scrollState.overscrollBehaviorX).toBe("none");
    expect(scrollState.panBackgroundColor).toBe("rgba(0, 0, 0, 0)");
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

  test("touch mode extends the video canvas to the physical screen height", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: "http://localhost:3000",
      hasTouch: true,
      screen: { height: 874, width: 402 },
      viewport: { height: 760, width: 402 },
    });
    const page = await context.newPage();

    await page.goto("/tools/frame-demo/full-bleed");

    const demo = page.locator("main[data-demo='full-bleed']");

    await expect(demo).toHaveAttribute("data-browser-content-height", "760");
    await expect(demo).toHaveAttribute("data-browser-canvas-height", "874");
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "497");

    const geometry = await page.evaluate(() => {
      const main = document.querySelector("main")?.getBoundingClientRect();
      const video = document.querySelector("video")?.getBoundingClientRect();

      return {
        innerHeight: window.innerHeight,
        mainHeight: main?.height,
        maxScroll:
          (document.scrollingElement?.scrollHeight ?? 0) - window.innerHeight,
        screenHeight: window.screen.height,
        scrollHeight: document.scrollingElement?.scrollHeight,
        videoHeight: video?.height,
      };
    });

    expect(geometry).toEqual({
      innerHeight: 760,
      mainHeight: 874,
      maxScroll: 115,
      screenHeight: 874,
      scrollHeight: 875,
      videoHeight: 874,
    });

    await context.close();
  });

  test("the rendered large-viewport height remains the geometry source", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: "http://localhost:3000",
      hasTouch: true,
      screen: { height: 800, width: 460 },
      viewport: { height: 800, width: 460 },
    });
    const page = await context.newPage();

    await page.goto("/tools/frame-demo/full-bleed");
    await page.addStyleTag({
      content:
        "main[data-demo='full-bleed'] { min-height: 1000px !important; }",
    });

    const demo = page.locator("main[data-demo='full-bleed']");

    await expect(demo).toHaveAttribute("data-browser-content-height", "800");
    await expect(demo).toHaveAttribute("data-browser-canvas-height", "1000");
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "497");
    await expect(demo).toHaveCSS("height", "1000px");
    await expect(page.locator("video")).toHaveCSS("height", "1000px");

    await context.close();
  });

  test("split-screen touch windows do not expand to the whole device", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: "http://localhost:3000",
      hasTouch: true,
      screen: { height: 1200, width: 1000 },
      viewport: { height: 800, width: 500 },
    });
    const page = await context.newPage();

    await page.goto("/tools/frame-demo/full-bleed");

    const demo = page.locator("main[data-demo='full-bleed']");

    await expect(demo).toHaveAttribute("data-browser-content-height", "800");
    await expect(demo).toHaveAttribute("data-browser-canvas-height", "800");
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "675");

    await context.close();
  });

  test("screen-height sizing uses the landscape device canvas", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      baseURL: "http://localhost:3000",
      hasTouch: true,
      screen: { height: 440, width: 956 },
      viewport: { height: 390, width: 838 },
    });
    const page = await context.newPage();

    await page.goto("/tools/frame-demo/full-bleed");

    const demo = page.locator("main[data-demo='full-bleed']");

    await expect(demo).toHaveAttribute("data-browser-content-height", "390");
    await expect(demo).toHaveAttribute("data-browser-canvas-height", "440");
    await expect(demo).toHaveAttribute("data-supported", "true");
    await expect(demo).toHaveCSS("height", "440px");

    await context.close();
  });

  test("single-video mode stays border-free while preserving panning", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto("/tools/frame-demo/full-bleed");

    const demo = page.locator("main[data-demo='full-bleed']");
    const panSurface = page.locator("[data-pan-surface='true']");
    const video = page.locator("video");

    await expect(demo).toHaveAttribute("data-source", "home-landscape");
    await expect(demo).toHaveAttribute("data-pan-enabled", "false");
    await expect(demo).toHaveAttribute("data-viewport-height", "screen");
    await expect(demo).toHaveAttribute(
      "data-layout-mode",
      "visible-source-frame",
    );
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "1728");
    await expect(demo).toHaveAttribute("data-safe-zone-source-height", "1080");
    await expect(demo).toHaveAttribute("data-supported", "true");
    await expect(page.locator("[data-safe-zone='true']")).toHaveCount(0);
    await expect(page.locator("[data-minimum-safe-zone='true']")).toHaveCount(
      0,
    );

    const desktopGeometry = await video.evaluate((element) => {
      const rect = element.getBoundingClientRect();

      return { height: rect.height, width: rect.width };
    });

    expect(desktopGeometry.width).toBeCloseTo(1600, 0);
    expect(desktopGeometry.height).toBeCloseTo(1000, 0);

    await page.setViewportSize({ width: 760, height: 1000 });
    await expect(demo).toHaveAttribute("data-pan-enabled", "true");
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "821");
    await expect(demo).toHaveAttribute("data-safe-zone-source-height", "1080");

    const centeredPan = await panSurface.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollLeft: element.scrollLeft,
      scrollWidth: element.scrollWidth,
    }));

    expect(centeredPan.clientWidth).toBeCloseTo(760, 0);
    expect(centeredPan.scrollWidth).toBeCloseTo(1600, 0);
    expect(centeredPan.scrollLeft).toBeCloseTo(420, 0);

    const horizontalBounds = await panSurface.evaluate((element) => {
      element.scrollLeft = -200;
      const leftEdge = element.scrollLeft;
      element.scrollLeft = element.scrollWidth + 200;

      return {
        leftEdge,
        maximumScroll: element.scrollWidth - element.clientWidth,
        rightEdge: element.scrollLeft,
      };
    });

    expect(horizontalBounds.leftEdge).toBe(0);
    expect(horizontalBounds.rightEdge).toBe(horizontalBounds.maximumScroll);

    await panSurface.evaluate((element) => {
      element.scrollLeft = 0;
    });

    await expect
      .poll(() => panSurface.evaluate((element) => element.scrollLeft))
      .toBeCloseTo(0, 0);

    const pannedVideoLeft = await video.evaluate(
      (element) => element.getBoundingClientRect().left,
    );

    expect(pannedVideoLeft).toBeCloseTo(0, 0);

    await page.setViewportSize({ width: 460, height: 1000 });
    await expect(demo).toHaveAttribute("data-supported", "true");
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "497");
    await expect(demo).toHaveAttribute("data-safe-zone-source-height", "1080");

    await page.setViewportSize({ width: 2000, height: 1000 });
    await expect(demo).toHaveAttribute("data-pan-enabled", "false");
    await expect(demo).toHaveAttribute("data-supported", "true");
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "1728");
    await expect(demo).toHaveAttribute("data-safe-zone-source-height", "864");

    await page.setViewportSize({ width: 450, height: 1000 });
    await expect(demo).toHaveAttribute("data-supported", "false");
    await expect(page.locator("[data-safe-zone='true']")).toHaveCount(0);
  });
});
