import { expect, test, type Page } from "@playwright/test";

type MediaState = {
  playlist: {
    currentTime: number;
    muted: boolean;
    networkState: number;
    paused: boolean;
    readyState: number;
    src: string;
    volume: number;
  };
  video: {
    currentTime: number;
    muted: boolean;
    networkState: number;
    paused: boolean;
    readyState: number;
    src: string;
    volume: number;
  };
};

const dualAudioSettings = {
  manifest: {
    version: 1,
    updatedAt: "2026-07-10T00:00:00.000Z",
    rooms: {
      construction: { roomAudioVolume: 1, playlistVolume: 0 },
      hq: { roomAudioVolume: 0.8, playlistVolume: 0.71 },
      "tv-room": { roomAudioVolume: 0.69, playlistVolume: 0.6 },
      "hole-room": { roomAudioVolume: 0.81, playlistVolume: 0.6 },
    },
  },
  source: "r2",
};

async function readMediaState(page: Page): Promise<MediaState> {
  return page.evaluate(() => {
    const video = document.querySelector<HTMLVideoElement>(
      'video[aria-label="Paper Planet HQ room video"]',
    );
    const playlist = document.querySelector<HTMLAudioElement>("audio");

    if (!video || !playlist) {
      throw new Error("Expected both HQ media elements.");
    }

    return {
      video: {
        currentTime: video.currentTime,
        muted: video.muted,
        networkState: video.networkState,
        paused: video.paused,
        readyState: video.readyState,
        src: video.currentSrc,
        volume: video.volume,
      },
      playlist: {
        currentTime: playlist.currentTime,
        muted: playlist.muted,
        networkState: playlist.networkState,
        paused: playlist.paused,
        readyState: playlist.readyState,
        src: playlist.currentSrc,
        volume: playlist.volume,
      },
    };
  });
}

async function waitForHealthyDualAudio(page: Page, timeout = 8_000) {
  try {
    await page.waitForFunction(
      () => {
        const video = document.querySelector<HTMLVideoElement>(
          'video[aria-label="Paper Planet HQ room video"]',
        );
        const playlist = document.querySelector<HTMLAudioElement>("audio");

        return Boolean(
          video &&
            playlist &&
            !video.paused &&
            !video.muted &&
            video.volume > 0 &&
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
            !playlist.paused &&
            !playlist.muted &&
            playlist.volume > 0 &&
            playlist.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
        );
      },
      undefined,
      { timeout },
    );
  } catch (error) {
    const diagnostic = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLMediaElement>("video,audio")).map(
        (media) => ({
          currentTime: media.currentTime,
          error: media.error?.code ?? null,
          muted: media.muted,
          networkState: media.networkState,
          paused: media.paused,
          readyState: media.readyState,
          src: media.currentSrc,
          tag: media.tagName,
          volume: media.volume,
        }),
      ),
    );

    throw new Error(
      `Dual audio did not become healthy: ${JSON.stringify(diagnostic)}`,
      { cause: error },
    );
  }
}

async function openHqWithDualAudio(page: Page) {
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dualAudioSettings),
    }),
  );
  const settingsLoaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/settings" && response.ok(),
  );

  await page.goto("/?debug=true", { waitUntil: "domcontentloaded" });
  await settingsLoaded;
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await page
    .getByRole("link", { name: "Paper Planet HQ", exact: true })
    .click();
  await waitForHealthyDualAudio(page);
}

async function navigateByRoomTitle(page: Page, title: string) {
  await page.getByRole("link", { name: title, exact: true }).click();
}

async function waitForRoomVideo(page: Page, roomTitle: string) {
  await page.waitForFunction(
    (title) => {
      const video = document.querySelector<HTMLVideoElement>(
        `video[aria-label="${title} room video"]`,
      );

      return Boolean(
        video &&
          !video.paused &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          !document.querySelector('img[src*="paper-planet-loading"]'),
      );
    },
    roomTitle,
    { timeout: 10_000 },
  );
}

async function waitForRoomVideoSource(
  page: Page,
  roomTitle: string,
  sourceFragment: string,
) {
  await page.waitForFunction(
    ({ sourceFragment, title }) => {
      const video = Array.from(document.querySelectorAll("video")).find(
        (candidate) =>
          candidate.getAttribute("aria-label") === `${title} room video` &&
          candidate.currentSrc.includes(sourceFragment),
      );

      return Boolean(
        video &&
          !video.paused &&
          video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          !document.querySelector('img[src*="paper-planet-loading"]'),
      );
    },
    { sourceFragment, title: roomTitle },
    { timeout: 15_000 },
  );
}

function mediaAdvanced(before: MediaState, after: MediaState) {
  const videoAdvanced =
    after.video.src !== before.video.src ||
    after.video.currentTime < before.video.currentTime ||
    after.video.currentTime - before.video.currentTime > 0.5;
  const playlistAdvanced =
    after.playlist.src !== before.playlist.src ||
    after.playlist.currentTime < before.playlist.currentTime ||
    after.playlist.currentTime - before.playlist.currentTime > 0.5;

  return { playlistAdvanced, videoAdvanced };
}

test("HQ transition is bounded and both audio streams advance", async ({
  page,
}, testInfo) => {
  const startedAt = Date.now();

  await openHqWithDualAudio(page);

  const transitionMs = Date.now() - startedAt;
  const before = await readMediaState(page);

  await page.waitForTimeout(2_500);

  const after = await readMediaState(page);
  const advanced = mediaAdvanced(before, after);

  expect(transitionMs).toBeLessThan(8_000);
  expect(before.video.volume).toBeCloseTo(0.8, 2);
  expect(before.playlist.volume).toBeCloseTo(0.71, 2);
  expect(advanced.videoAdvanced).toBe(true);
  expect(advanced.playlistAdvanced).toBe(true);

  await testInfo.attach("media-state.json", {
    body: JSON.stringify({ transitionMs, before, after }, null, 2),
    contentType: "application/json",
  });
});

test("video and playlist recover independently", async ({ page }) => {
  await openHqWithDualAudio(page);

  const beforePlaylistPause = await readMediaState(page);

  await page.locator("audio").evaluate((audio: HTMLAudioElement) => audio.pause());
  await waitForHealthyDualAudio(page);
  await page.waitForTimeout(750);

  const afterPlaylistRecovery = await readMediaState(page);

  expect(
    mediaAdvanced(beforePlaylistPause, afterPlaylistRecovery).videoAdvanced,
  ).toBe(true);

  const beforeVideoPause = afterPlaylistRecovery;

  await page
    .locator('video[aria-label="Paper Planet HQ room video"]')
    .evaluate((video: HTMLVideoElement) => video.pause());
  await waitForHealthyDualAudio(page);
  await page.waitForTimeout(750);

  const afterVideoRecovery = await readMediaState(page);

  expect(
    mediaAdvanced(beforeVideoPause, afterVideoRecovery).playlistAdvanced,
  ).toBe(true);

  await page.locator("audio").evaluate((audio: HTMLAudioElement) => {
    audio.src = "/__playlist-failure__.mp3";
    audio.load();
  });
  await waitForHealthyDualAudio(page);

  await page
    .locator('video[aria-label="Paper Planet HQ room video"]')
    .evaluate((video: HTMLVideoElement) => {
      video.src = "/__video-failure__.mp4";
      video.load();
    });
  await waitForHealthyDualAudio(page);

  const finalState = await readMediaState(page);

  expect(finalState.video.src).toContain("/rooms/hq-desktop.mp4");
  expect(finalState.playlist.src).toContain("/audio/normalized/hq/");
});

test("offline return recovers both streams", async ({ context, page }) => {
  await openHqWithDualAudio(page);
  await context.setOffline(true);
  await page.evaluate(() => {
    document.querySelector<HTMLVideoElement>(
      'video[aria-label="Paper Planet HQ room video"]',
    )?.pause();
    document.querySelector<HTMLAudioElement>("audio")?.pause();
  });
  await page.waitForTimeout(2_000);
  await context.setOffline(false);
  await page.bringToFront();
  await waitForHealthyDualAudio(page, 10_000);
});

test("room cycling never leaves playlist audio in the wrong room", async ({
  page,
}) => {
  await openHqWithDualAudio(page);

  await navigateByRoomTitle(page, "Construction Zone");
  await waitForRoomVideo(page, "Construction Zone");

  await expect
    .poll(() =>
      page.locator("audio").evaluate((audio: HTMLAudioElement) => ({
        hasSource: audio.hasAttribute("src"),
        muted: audio.muted,
        paused: audio.paused,
        volume: audio.volume,
      })),
    )
    .toEqual({ hasSource: false, muted: true, paused: true, volume: 0 });

  await navigateByRoomTitle(page, "Paper Planet TV Room");
  await waitForRoomVideo(page, "Paper Planet TV Room");
  await navigateByRoomTitle(page, "Construction Zone");
  await waitForRoomVideo(page, "Construction Zone");
  await navigateByRoomTitle(page, "Paper Planet Hole Room");
  await waitForRoomVideo(page, "Paper Planet Hole Room");
  await navigateByRoomTitle(page, "Construction Zone");
  await waitForRoomVideo(page, "Construction Zone");
  await navigateByRoomTitle(page, "Paper Planet HQ");
  await waitForHealthyDualAudio(page, 10_000);
});

test("viewport handoff keeps one steady-state video pipeline", async ({
  page,
}) => {
  await openHqWithDualAudio(page);
  await expect(page.locator("video")).toHaveCount(1);

  const beforeMobile = await readMediaState(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await waitForRoomVideoSource(page, "Paper Planet HQ", "hq-mobile.mp4");
  await waitForHealthyDualAudio(page, 10_000);
  await expect(page.locator("video")).toHaveCount(1);
  await expect(
    page.locator('video[aria-label="Paper Planet HQ room video"]'),
  ).toHaveAttribute("src", /hq-mobile\.mp4/);

  await page.waitForTimeout(750);
  const afterMobile = await readMediaState(page);

  expect(mediaAdvanced(beforeMobile, afterMobile).playlistAdvanced).toBe(true);

  await page.setViewportSize({ width: 1280, height: 720 });
  await waitForRoomVideoSource(page, "Paper Planet HQ", "hq-desktop.mp4");
  await waitForHealthyDualAudio(page, 10_000);
  await expect(page.locator("video")).toHaveCount(1);
  await expect(
    page.locator('video[aria-label="Paper Planet HQ room video"]'),
  ).toHaveAttribute("src", /hq-desktop\.mp4/);
});

test("playlist track boundaries preserve dual playback", async ({ page }) => {
  await openHqWithDualAudio(page);
  const before = await readMediaState(page);

  const startingSource = await page.locator("audio").evaluate(
    (audio: HTMLAudioElement) => {
      if (!Number.isFinite(audio.duration) || audio.duration <= 0.5) {
        throw new Error("Playlist duration was not ready.");
      }

      const source = audio.currentSrc;
      audio.currentTime = audio.duration - 0.2;
      return source;
    },
  );

  await page.waitForFunction(
    (previousSource) => {
      const audio = document.querySelector<HTMLAudioElement>("audio");

      return Boolean(
        audio &&
          audio.currentSrc !== previousSource &&
          !audio.paused &&
          !audio.muted &&
          audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      );
    },
    startingSource,
    { timeout: 10_000 },
  );
  await waitForHealthyDualAudio(page);
  await page.waitForTimeout(750);

  const after = await readMediaState(page);

  expect(after.playlist.src).not.toBe(startingSource);
  expect(mediaAdvanced(before, after).videoAdvanced).toBe(true);
});

test("latest rapid room navigation owns both media streams", async ({ page }) => {
  await openHqWithDualAudio(page);

  for (const roomTitle of [
    "Paper Planet TV Room",
    "Paper Planet Hole Room",
    "Construction Zone",
    "Paper Planet HQ",
  ]) {
    await navigateByRoomTitle(page, roomTitle);
  }

  await waitForHealthyDualAudio(page, 15_000);
  await expect(page.locator("video")).toHaveCount(1);

  const before = await readMediaState(page);

  expect(before.video.src).toContain("/rooms/hq-desktop.mp4");
  expect(before.playlist.src).toContain("/audio/normalized/hq/");
  expect(before.video.volume).toBeCloseTo(0.8, 2);
  expect(before.playlist.volume).toBeCloseTo(0.71, 2);

  await page.waitForTimeout(1_000);

  const after = await readMediaState(page);
  const advanced = mediaAdvanced(before, after);

  expect(advanced.videoAdvanced).toBe(true);
  expect(advanced.playlistAdvanced).toBe(true);
});

test("intentional mixer mutes survive watchdog intervals", async ({ page }) => {
  await openHqWithDualAudio(page);
  const beforePlaylistMute = await readMediaState(page);

  await page
    .getByRole("button", { name: "Mute playlist", exact: true })
    .click();
  await page.waitForTimeout(6_000);

  const whilePlaylistMuted = await readMediaState(page);

  expect(whilePlaylistMuted.playlist.muted).toBe(true);
  expect(whilePlaylistMuted.video.muted).toBe(false);
  expect(
    mediaAdvanced(beforePlaylistMute, whilePlaylistMuted).videoAdvanced,
  ).toBe(true);

  await page
    .getByRole("button", { name: "Unmute playlist", exact: true })
    .click();
  await waitForHealthyDualAudio(page);

  const beforeVideoMute = await readMediaState(page);

  await page.getByRole("button", { name: "Mute", exact: true }).click();
  await page.waitForTimeout(6_000);

  const whileVideoMuted = await readMediaState(page);

  expect(whileVideoMuted.video.muted).toBe(true);
  expect(whileVideoMuted.playlist.muted).toBe(false);
  expect(
    mediaAdvanced(beforeVideoMute, whileVideoMuted).playlistAdvanced,
  ).toBe(true);

  await page.getByRole("button", { name: "Unmute", exact: true }).click();
  await waitForHealthyDualAudio(page);
});

test("@soak dual audio remains healthy for twenty minutes", async ({
  context,
  page,
}, testInfo) => {
  const soakDurationMs = Number(
    process.env.MEDIA_SOAK_MS ?? 20 * 60 * 1_000,
  );
  const sampleIntervalMs = Math.min(5_000, Math.max(1_000, soakDurationMs / 20));
  const log: Array<{ elapsedMs: number; state: MediaState }> = [];
  const startedAt = Date.now();
  let backgroundChecked = false;
  let offlineChecked = false;
  let brokenSourceChecked = false;
  let previous: MediaState;

  test.setTimeout(soakDurationMs + 90_000);
  await openHqWithDualAudio(page);
  previous = await readMediaState(page);

  while (Date.now() - startedAt < soakDurationMs) {
    const elapsed = Date.now() - startedAt;

    if (!backgroundChecked && elapsed >= soakDurationMs * 0.25) {
      backgroundChecked = true;
      const backgroundPage = await context.newPage();

      await backgroundPage.goto("about:blank");
      await backgroundPage.waitForTimeout(Math.min(3_000, sampleIntervalMs));
      await backgroundPage.close();
      await page.bringToFront();
      await waitForHealthyDualAudio(page, 10_000);
    }

    if (!offlineChecked && elapsed >= soakDurationMs * 0.5) {
      offlineChecked = true;
      await context.setOffline(true);
      await page.evaluate(() => {
        document.querySelector<HTMLVideoElement>(
          'video[aria-label="Paper Planet HQ room video"]',
        )?.pause();
        document.querySelector<HTMLAudioElement>("audio")?.pause();
      });
      await page.waitForTimeout(Math.min(3_000, sampleIntervalMs));
      await context.setOffline(false);
      await page.bringToFront();
      await waitForHealthyDualAudio(page, 10_000);
    }

    if (!brokenSourceChecked && elapsed >= soakDurationMs * 0.75) {
      brokenSourceChecked = true;
      await page.evaluate(() => {
        const video = document.querySelector<HTMLVideoElement>(
          'video[aria-label="Paper Planet HQ room video"]',
        );
        const playlist = document.querySelector<HTMLAudioElement>("audio");

        if (video) {
          video.src = "/__video-soak-failure__.mp4";
          video.load();
        }

        if (playlist) {
          playlist.src = "/__playlist-soak-failure__.mp3";
          playlist.load();
        }
      });
      await waitForHealthyDualAudio(page, 12_000);
    }

    await page.waitForTimeout(sampleIntervalMs);
    await waitForHealthyDualAudio(page, 10_000);

    const state = await readMediaState(page);
    const advanced = mediaAdvanced(previous, state);

    if (!advanced.videoAdvanced || !advanced.playlistAdvanced) {
      await page.waitForTimeout(2_000);

      const retryState = await readMediaState(page);
      const retryAdvanced = mediaAdvanced(state, retryState);

      expect(retryAdvanced.videoAdvanced).toBe(true);
      expect(retryAdvanced.playlistAdvanced).toBe(true);
      previous = retryState;
      log.push({ elapsedMs: Date.now() - startedAt, state: retryState });
    } else {
      previous = state;
      log.push({ elapsedMs: Date.now() - startedAt, state });
    }
  }

  await testInfo.attach("soak-log.json", {
    body: JSON.stringify(
      {
        browser: testInfo.project.name,
        durationMs: Date.now() - startedAt,
        backgroundChecked,
        offlineChecked,
        brokenSourceChecked,
        samples: log,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
