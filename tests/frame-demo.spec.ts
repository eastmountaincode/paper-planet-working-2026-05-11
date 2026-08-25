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
});
