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

  test("single-video mode stays full bleed while its safe zone narrows", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 1000 });
    await page.goto("/tools/frame-demo/full-bleed");

    const demo = page.locator("main[data-demo='full-bleed']");

    await expect(demo).toHaveAttribute("data-source", "home-landscape");
    await expect(demo).toHaveAttribute("data-layout-mode", "fixed-safe-zone");
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "864");
    await expect(demo).toHaveAttribute("data-safe-zone-source-height", "864");
    await expect(demo).toHaveAttribute("data-supported", "true");
    const minimumSafeZone = page.locator("[data-minimum-safe-zone='true']");

    await expect(minimumSafeZone).toHaveAttribute("data-source-width", "497");
    await expect(minimumSafeZone).toHaveAttribute("data-source-height", "864");

    await page.setViewportSize({ width: 760, height: 1000 });
    await expect(demo).toHaveAttribute(
      "data-layout-mode",
      "dynamic-safe-zone",
    );
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "821");
    await expect(demo).toHaveAttribute("data-safe-zone-source-height", "864");
    await expect(demo).toHaveAttribute("data-safe-zone-visible", "true");

    const geometry = await page.evaluate(() => {
      const video = document.querySelector("video")?.getBoundingClientRect();
      const safeZone = document
        .querySelector("[data-safe-zone='true']")
        ?.getBoundingClientRect();
      const minimumSafeZone = document
        .querySelector("[data-minimum-safe-zone='true']")
        ?.getBoundingClientRect();

      return {
        minimumSafeZone: minimumSafeZone
          ? {
              height: minimumSafeZone.height,
              left: minimumSafeZone.left,
              top: minimumSafeZone.top,
              width: minimumSafeZone.width,
            }
          : null,
        safeZone: safeZone
          ? {
              height: safeZone.height,
              top: safeZone.top,
              width: safeZone.width,
            }
          : null,
        video: video
          ? {
              height: video.height,
              top: video.top,
              width: video.width,
            }
          : null,
      };
    });

    expect(geometry.video?.width).toBeCloseTo(760, 0);
    expect(geometry.video?.height).toBeCloseTo(1000, 0);
    expect(geometry.video?.top).toBeCloseTo(0, 0);
    expect(geometry.minimumSafeZone?.width).toBeCloseTo(460, 0);
    expect(geometry.minimumSafeZone?.height).toBeCloseTo(800, 0);
    expect(geometry.minimumSafeZone?.left).toBeCloseTo(150, 0);
    expect(geometry.minimumSafeZone?.top).toBeCloseTo(100, 0);
    expect(geometry.safeZone?.width).toBeCloseTo(760, 0);
    expect(geometry.safeZone?.height).toBeCloseTo(800, 0);
    expect(geometry.safeZone?.top).toBeCloseTo(100, 0);

    await page.setViewportSize({ width: 460, height: 1000 });
    await expect(demo).toHaveAttribute("data-supported", "true");
    await expect(demo).toHaveAttribute("data-safe-zone-source-width", "497");
    await expect(demo).toHaveAttribute("data-safe-zone-source-height", "864");

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

    await page.setViewportSize({ width: 450, height: 1000 });
    await expect(demo).toHaveAttribute("data-supported", "false");
    await expect(page.locator("[data-safe-zone='true']")).toHaveClass(
      /border-red-400/,
    );
  });
});
