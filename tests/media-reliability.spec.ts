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

type NavigationMetrics = {
  elementMs: number | null;
  firstFrameMs: number | null;
  metadataMs: number | null;
  overlayMs: number | null;
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

const HQ_VIDEO_DURATION_SECONDS = 237.142;

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

async function beginHqNavigationMetrics(page: Page) {
  await page.evaluate(() => {
    const metrics: NavigationMetrics = {
      elementMs: null,
      firstFrameMs: null,
      metadataMs: null,
      overlayMs: null,
    };
    const startedAt = performance.now();
    const targetWindow = window as typeof window & {
      __hqNavigationMetrics?: NavigationMetrics;
    };
    let frameCallbackRequested = false;

    targetWindow.__hqNavigationMetrics = metrics;

    const sample = () => {
      const video = document.querySelector<HTMLVideoElement>(
        'video[aria-label="Paper Planet HQ room video"]',
      );

      if (!video) {
        window.requestAnimationFrame(sample);
        return;
      }

      const elapsed = () => performance.now() - startedAt;

      metrics.elementMs ??= elapsed();

      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        metrics.metadataMs ??= elapsed();
      }

      if (!frameCallbackRequested) {
        frameCallbackRequested = true;
        const videoWithFrameCallback = video as HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number;
        };

        if (typeof videoWithFrameCallback.requestVideoFrameCallback === "function") {
          videoWithFrameCallback.requestVideoFrameCallback(() => {
            metrics.firstFrameMs ??= elapsed();
          });
        }
      }

      if (
        metrics.firstFrameMs === null &&
        video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        !video.paused &&
        video.currentTime > 0
      ) {
        metrics.firstFrameMs = elapsed();
      }

      if (!document.querySelector('img[src*="paper-planet-loading"]')) {
        metrics.overlayMs ??= elapsed();
      }

      if (
        metrics.metadataMs === null ||
        metrics.firstFrameMs === null ||
        metrics.overlayMs === null
      ) {
        window.requestAnimationFrame(sample);
      }
    };

    window.requestAnimationFrame(sample);
  });
}

async function readHqNavigationMetrics(page: Page) {
  await page.waitForFunction(
    () => {
      const metrics = (
        window as typeof window & {
          __hqNavigationMetrics?: NavigationMetrics;
        }
      ).__hqNavigationMetrics;

      return Boolean(
        metrics?.elementMs !== null &&
          metrics?.metadataMs !== null &&
          metrics?.firstFrameMs !== null &&
          metrics?.overlayMs !== null,
      );
    },
    undefined,
    { timeout: 10_000 },
  );

  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __hqNavigationMetrics?: NavigationMetrics;
        }
      ).__hqNavigationMetrics as NavigationMetrics,
  );
}

async function openHqWithDualAudio(page: Page, measureNavigation = false) {
  await page.route("**/api/runtime", async (route) => {
    const response = await route.fetch();
    const result = (await response.json()) as Record<string, unknown>;

    await route.fulfill({
      response,
      json: { ...result, settings: dualAudioSettings },
    });
  });
  const settingsLoaded = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/runtime" && response.ok(),
  );

  await page.goto("/?debug=true", { waitUntil: "domcontentloaded" });
  await settingsLoaded;
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  if (measureNavigation) {
    await beginHqNavigationMetrics(page);
  }
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

async function setSyntheticPageVisibility(page: Page, hidden: boolean) {
  await page.evaluate((nextHidden) => {
    Object.defineProperties(document, {
      hidden: {
        configurable: true,
        get: () => nextHidden,
      },
      visibilityState: {
        configurable: true,
        get: () => (nextHidden ? "hidden" : "visible"),
      },
    });
    document.dispatchEvent(new Event("visibilitychange"));

    if (!nextHidden) {
      Reflect.deleteProperty(document, "hidden");
      Reflect.deleteProperty(document, "visibilityState");
    }
  }, hidden);
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

function circularTimeDistance(
  left: number,
  right: number,
  duration: number,
) {
  const directDistance = Math.abs(left - right);

  return Math.min(directDistance, duration - directDistance);
}

test("HQ transition is bounded and both audio streams advance", async ({
  page,
}, testInfo) => {
  await openHqWithDualAudio(page, true);

  const navigationMetrics = await readHqNavigationMetrics(page);

  if (process.env.REPORT_MEDIA_METRICS === "1") {
    console.log(
      `[${testInfo.project.name}] HQ navigation ${JSON.stringify(navigationMetrics)}`,
    );
  }

  const before = await readMediaState(page);

  await page.waitForTimeout(2_500);

  const after = await readMediaState(page);
  const advanced = mediaAdvanced(before, after);

  expect(navigationMetrics.elementMs).toBeLessThan(500);
  expect(navigationMetrics.firstFrameMs).toBeLessThan(3_000);
  expect(navigationMetrics.overlayMs).toBeLessThan(3_000);
  expect(before.video.volume).toBeCloseTo(0.8, 2);
  expect(before.playlist.volume).toBeCloseTo(0.71, 2);
  expect(advanced.videoAdvanced).toBe(true);
  expect(advanced.playlistAdvanced).toBe(true);

  await testInfo.attach("media-state.json", {
    body: JSON.stringify({ navigationMetrics, before, after }, null, 2),
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

  const beforeVideoSourceFailure = await readMediaState(page);
  const videoSourceFailureStartedAt = Date.now();

  await page
    .locator('video[aria-label="Paper Planet HQ room video"]')
    .evaluate((video: HTMLVideoElement) => {
      video.src = "/__video-failure__.mp4";
      video.load();
    });
  await waitForHealthyDualAudio(page);

  const finalState = await readMediaState(page);
  const expectedVideoTime =
    (beforeVideoSourceFailure.video.currentTime +
      (Date.now() - videoSourceFailureStartedAt) / 1_000) %
    HQ_VIDEO_DURATION_SECONDS;

  expect(finalState.video.src).toContain("/rooms/hq-desktop.mp4");
  expect(finalState.playlist.src).toContain("/audio/normalized/hq/");
  expect(
    circularTimeDistance(
      finalState.video.currentTime,
      expectedVideoTime,
      HQ_VIDEO_DURATION_SECONDS,
    ),
  ).toBeLessThan(3);
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

test("visibility return recovers both streams", async ({ page }) => {
  await openHqWithDualAudio(page);
  await setSyntheticPageVisibility(page, true);
  await page.evaluate(() => {
    document.querySelector<HTMLVideoElement>(
      'video[aria-label="Paper Planet HQ room video"]',
    )?.pause();
    document.querySelector<HTMLAudioElement>("audio")?.pause();
  });
  await page.waitForTimeout(2_000);
  await setSyntheticPageVisibility(page, false);
  await waitForHealthyDualAudio(page, 10_000);
});

test("Chromium frozen lifecycle restores dual playback", async ({
  browserName,
  context,
  page,
}) => {
  test.skip(browserName !== "chromium", "Chromium DevTools lifecycle only.");

  await openHqWithDualAudio(page);
  const before = await readMediaState(page);
  const devtools = await context.newCDPSession(page);

  await devtools.send("Page.setWebLifecycleState", { state: "frozen" });
  await page.waitForTimeout(3_000);
  await devtools.send("Page.setWebLifecycleState", { state: "active" });
  await page.bringToFront();
  await waitForHealthyDualAudio(page, 10_000);
  await page.waitForTimeout(750);

  const after = await readMediaState(page);
  const advanced = mediaAdvanced(before, after);

  expect(advanced.videoAdvanced).toBe(true);
  expect(advanced.playlistAdvanced).toBe(true);
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

  await page.locator("audio").evaluate((audio: HTMLAudioElement) => {
    const targetWindow = window as typeof window & {
      __playlistBoundaryEvents?: { ended: number; playing: number };
    };

    if (!Number.isFinite(audio.duration) || audio.duration <= 0.5) {
      throw new Error("Playlist duration was not ready.");
    }

    targetWindow.__playlistBoundaryEvents = { ended: 0, playing: 0 };
    audio.addEventListener("ended", () => {
      if (targetWindow.__playlistBoundaryEvents) {
        targetWindow.__playlistBoundaryEvents.ended += 1;
      }
    });
    audio.addEventListener("playing", () => {
      const events = targetWindow.__playlistBoundaryEvents;

      if (events && events.ended > 0) {
        events.playing += 1;
      }
    });
    audio.currentTime = audio.duration - 0.2;
  });

  await page.waitForFunction(
    () => {
      const audio = document.querySelector<HTMLAudioElement>("audio");
      const events = (
        window as typeof window & {
          __playlistBoundaryEvents?: { ended: number; playing: number };
        }
      ).__playlistBoundaryEvents;

      return Boolean(
        audio &&
          events &&
          events.ended > 0 &&
          events.playing > 0 &&
          !audio.paused &&
          !audio.muted &&
          audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      );
    },
    undefined,
    { timeout: 10_000 },
  );
  await waitForHealthyDualAudio(page);
  await page.waitForTimeout(750);

  const after = await readMediaState(page);

  expect(after.playlist.src).toContain("/audio/normalized/hq/");
  expect(mediaAdvanced(before, after).videoAdvanced).toBe(true);
});

test("playing playlist corrects synchronized clock drift", async ({ page }) => {
  await openHqWithDualAudio(page);
  const before = await readMediaState(page);

  await page.locator("audio").evaluate((audio: HTMLAudioElement) => {
    const targetWindow = window as typeof window & {
      __playlistSeekedCount?: number;
    };
    const upperBound = Math.max(audio.duration - 0.5, 0);
    const targetTime =
      audio.currentTime < upperBound / 2 ? upperBound * 0.75 : upperBound * 0.25;

    targetWindow.__playlistSeekedCount = 0;
    audio.addEventListener("seeked", () => {
      targetWindow.__playlistSeekedCount =
        (targetWindow.__playlistSeekedCount ?? 0) + 1;
    });
    audio.currentTime = targetTime;
  });

  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as typeof window & {
              __playlistSeekedCount?: number;
            }
          ).__playlistSeekedCount ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(2);
  await waitForHealthyDualAudio(page);
  await page.waitForTimeout(750);

  const after = await readMediaState(page);

  expect(mediaAdvanced(before, after).videoAdvanced).toBe(true);
  expect(after.playlist.muted).toBe(false);
  expect(after.playlist.paused).toBe(false);
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

test("runtime manifest outage falls back to static room media", async ({
  page,
}) => {
  await page.route("**/api/runtime", (route) => route.abort("failed"));
  await page.goto("/?debug=true", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Enter", exact: true }).click();
  await navigateByRoomTitle(page, "Paper Planet HQ");
  await waitForRoomVideo(page, "Paper Planet HQ");

  await page.waitForFunction(
    () => {
      const audio = document.querySelector<HTMLAudioElement>("audio");

      return Boolean(
        audio &&
          audio.currentSrc.includes("/audio/normalized/hq/") &&
          !audio.paused &&
          !audio.muted &&
          audio.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
      );
    },
    undefined,
    { timeout: 10_000 },
  );

  await expect(page.locator("video")).toHaveCount(1);
  await expect(
    page.locator('video[aria-label="Paper Planet HQ room video"]'),
  ).toHaveAttribute("src", /hq-desktop\.mp4/);
});

test("production hotspot links remain keyboard navigable", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Enter Paper Planet" }).click();

  const hqLink = page.getByRole("link", { name: "go to hq" });

  await hqLink.focus();
  await expect(hqLink).toBeFocused();
  await hqLink.press("Enter");
  await waitForRoomVideo(page, "Paper Planet HQ");
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
      await setSyntheticPageVisibility(page, true);
      await page.evaluate(() => {
        document.querySelector<HTMLVideoElement>(
          'video[aria-label="Paper Planet HQ room video"]',
        )?.pause();
        document.querySelector<HTMLAudioElement>("audio")?.pause();
      });
      await page.waitForTimeout(Math.min(3_000, sampleIntervalMs));
      await setSyntheticPageVisibility(page, false);
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
