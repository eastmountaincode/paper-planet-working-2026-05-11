import { expect, test } from "@playwright/test";

test.describe("video frame checker", () => {
  test("shows the landscape handoff gap", async ({
    page,
  }) => {
    await page.goto("/tools/video-frame");

    await expect(
      page.getByRole("heading", { name: "Video frame checker" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Open Home demo" }),
    ).toHaveAttribute("target", "_blank");
    await expect(
      page.getByRole("link", { name: "Open Green Room demo" }),
    ).toHaveAttribute("target", "_blank");
    await expect(
      page.getByRole("link", { name: "Open full-bleed demo" }),
    ).toHaveAttribute("target", "_blank");
    await page.getByRole("button", { name: "Switch point" }).click();
    await expect(
      page.getByText("This 0.75 viewport clips required content."),
    ).toBeVisible();
    await expect(page.getByText("810 × 1,080")).toBeVisible();

    await page.locator('input[type="range"]').evaluate((element) => {
      const input = element as HTMLInputElement;
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;

      valueSetter?.call(input, "0.8");
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(
      page.getByText("The full interaction area survives this 0.80 viewport."),
    ).toBeVisible();
  });

  test("fits a phone viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/tools/video-frame");

    await expect(page.getByRole("button", { name: "Choose video" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Viewport preview" })).toBeVisible();

    const sizes = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(sizes.scrollWidth).toBeLessThanOrEqual(sizes.clientWidth);
  });
});
