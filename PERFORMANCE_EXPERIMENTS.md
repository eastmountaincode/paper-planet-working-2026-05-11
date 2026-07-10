# Paper Planet performance experiments

Branch: `experiment/room-performance-audio-map-20260710`

## Baseline

- `npm run lint`: pass
- `npm run build`: pass with Next.js 16.2.6
- R2 HQ desktop video: 22,802,832 bytes, immutable Cloudflare cache hit, byte ranges supported, MP4 `moov` atom available in the first megabyte
- R2 HQ mobile video: 27,188,575 bytes, immutable Cloudflare cache hit, byte ranges supported, MP4 `moov` atom available in the first megabyte
- First 256 KB from the HQ video CDN edge: about 0.07 seconds in the initial local sample
- Warm Construction to HQ desktop navigation: first decoded HQ frame at 354.9 ms after click, including the fixed 200 ms fade
- Published HQ mix at baseline: room/video audio volume 0; playlist volume 0.71. The room audio is therefore intentionally inaudible in HQ until its setting is raised.

## Iteration 1: intent-driven synchronized video preloading

Hypothesis: the current hotspot intent handlers warm only playlist audio. Warming the destination video at its synchronized timestamp during hover, focus, pointer-down, and the transition fade should allow the displayed video element to reuse buffered response data and reduce first-frame latency.

Implementation:

- Preconnect and DNS-prefetch the configured media origin.
- Keep at most two detached destination video preloaders.
- Load only the viewport-appropriate destination source.
- Seek the preloader to the room's synchronized timestamp, decode one frame, then pause.
- Prime both playlist audio and room video from the existing hotspot intent events.

Result: warm first-frame time improved from 354.9 ms to 319.6 ms in the first comparable Chromium sample. This is useful but leaves the fixed 200 ms pre-mount delay untouched.

## Iteration 2: overlap destination mount with the transition

Hypothesis: mounting the destination video only after the 200 ms fade serializes animation and media work. Mounting it immediately while holding the loading veil for at least 200 ms should make the work concurrent and reduce perceived latency without shortening the designed transition.

Implementation:

- Begin the minimum-duration transition veil before the scene swap.
- Swap the active scene immediately so its media request and decode begin behind the veil.
- Reveal only after both conditions are true: a destination frame is ready and the minimum transition time has elapsed.

Result in the first warm Chromium sample:

- Destination video element mounted: 15.0 ms after click
- Destination metadata ready: 18.0 ms
- First decoded destination frame: 127.4 ms
- Loading veil released: 205.1 ms
- HQ playlist after a trusted user click: playing, unmuted, volume 0.71, ready state 4

The transition is now bounded by the intentional 200 ms animation instead of adding media loading after that animation. This is a reduction from about 354.9 ms to about 205.1 ms in the measured warm path.

Mobile Chromium sample using the separate 27.2 MB HQ portrait video:

- Destination mobile element mounted: 17.5 ms after click
- Destination metadata ready: 22.1 ms
- First decoded destination frame: 159.4 ms
- Loading veil released: 206.7 ms

The same animation-bounded behavior therefore holds on the mobile viewport branch.

## Iteration 3: consolidate and cache runtime manifests

The entry art and room runtime independently requested the public hotspot data,
while the room also requested playlists and settings. A first page load therefore
made four API requests and could fan out across separate serverless invocations.

Implementation:

- Add one `/api/runtime` endpoint that reads hotspot, playlist, and settings
  manifests concurrently.
- Share one in-flight client promise between the entry artwork and room runtime.
- Cache the combined server result for five minutes with a Next.js cache tag.
- Immediately expire that tag after every successful admin hotspot, playlist,
  or settings publish, preserving read-after-write behavior.
- Keep static normalizers as the fail-soft path if the combined request fails.

Production-server result:

- Initial page requests dropped from four manifest requests to one.
- Combined payload: about 92 KB.
- Cold local R2-backed request: 220.8 ms in the measured sample.
- Four following requests: 2.8-3.7 ms each.

## Iteration 4: align media preconnect and enforce navigation timing

All R2 media elements now use anonymous CORS, matching the media-origin
preconnect. This prevents the hint from warming a different credentials-mode
pool than the video and playlist requests. Cloudflare CORS exposes byte-range
headers for the configured app origins.

The Playwright regression captures destination element mount, metadata,
decoded frame, and loading-veil release from the in-page click timestamp. In a
concurrent production-build run:

- Chrome: element 23.5 ms, metadata 765.7 ms, first frame 970.2 ms, reveal
  973.1 ms.
- Firefox: element 38 ms, metadata 489 ms, first frame 521 ms, reveal 821 ms.
- WebKit: element 142 ms, metadata 469 ms, first frame 730 ms, reveal 841 ms.

The suite now fails if destination mount exceeds 500 ms or if first frame / veil
release exceed three seconds.

Final tail sample after all media-controller iterations (five fresh production
navigations per engine, 15/15 passed): destination elements mounted in
24.9-52.5 ms, first frames arrived in 132-1,090.6 ms, and loading veils cleared
in 380-1,099.3 ms. The slowest observed final path therefore remained under
1.1 seconds across Chrome, Firefox, and WebKit.

## Iteration 5: remove duplicate startup payloads

The server passed the entire construction scene to a client component that
already imports the same static fallback. The RSC HTML therefore serialized the
playlist and media metadata twice.

Result: production root HTML dropped from 42.3 KB to 9.15 KB. React Flow remains
admin-only, and the public production CSS remains 43 KB after its separate 15 KB
admin stylesheet split.

The combined runtime manifest response is 91.90 KB identity and 19.98 KB when
sampled through gzip (-78%). The local `next start` server did not compress the
dynamic route, but the live Vercel deployment was verified to negotiate both
gzip and Brotli for the existing public manifest endpoints.

Decision: rely on Vercel's platform compression in deployment. A manual gzip
implementation was rejected because it would add function CPU and prevent the
platform from choosing Brotli without reducing deployed transfer size.

## Reliability iteration: bounded R2 fallback

The S3/R2 client previously had no connection, request, socket, or total read
timeout. A stalled object request could therefore prevent the static fallback
from ever running.

Implementation:

- 3-second connection timeout.
- 8-second request and idle-socket timeout, with timeout errors enabled.
- Two SDK attempts maximum.
- Hard five-second abort for manifest reads.

Verification: with the R2 endpoint replaced by an unreachable address, the
public hotspot API returned HTTP 200 with the static four-room manifest in
5.024 seconds.

## Reliability iteration: synchronized clock drift

Playlist health now compares the current source, track index, and current time
to the global synchronized position every two seconds. A stream that still says
`playing` but falls more than 2.5 seconds behind is corrected without waiting
for a pause or media error. Unmuting a synchronized playlist also computes a
fresh global position instead of seeking back to stale React state.

The provider no longer updates playlist status state every second solely to
sample native `currentTime`, and video diagnostics sample only while the debug
panel is open. A normal 20-minute room visit therefore avoids roughly 2,400
timer-driven full-tree render requests while watchdogs continue reading live
native media snapshots.

Production Chrome profiling captured no React renders during six seconds of
steady HQ dual playback. A forced-GC navigation audit remained stable across 80
rapid room transitions:

- Documents: 1 throughout.
- DOM nodes: 504 after 40 transitions and 504 after 80.
- JavaScript event listeners: 414 after 40 and 414 after 80.
- Used heap: 5.52 MB after 40 and 5.64 MB after 80 (about 0.12 MB additional
  after the second 40-transition block).

## Iteration 6: avoid instant-intent duplicate pipelines

Video intent preloading now waits 80 ms. A quick click cancels the pending
preloader before it creates a media element; a sustained hover/focus still
warms the synchronized frame. Primed playlist audio is likewise released before
the shared playback element starts the same source.

The remaining two instant-click HQ video requests are the expected browser
sequence: `bytes=0-` for MP4 metadata followed by a range near the synchronized
timestamp. In a paired fresh Chrome sample, no-hover readiness was 519.4 ms and
a 250 ms hover reduced it to 286.4 ms, with one steady-state video element in
both cases.

## Iteration 7: make intent preloading connection-aware

A simulated 5 Mbps / 80 ms connection exposed the opposite edge of detached
preloading. Across three cache-disabled Chrome pairs, direct navigation had a
5.31-second median readiness time, while starting a detached preload after a
250 ms hover had a 7.40-second median. The incomplete range request could
compete with the clicked element instead of helping it.

Video intent warming now declines to start when the browser reports data-saver,
2G / slow-2G, or a downlink estimate at or below 5 Mbps. Browsers that do not
expose the Network Information API retain the bounded 80 ms intent behavior.
The cross-browser regression test injects a constrained connection and proves
that hover creates zero HQ video requests before the click in Chrome, Firefox,
and WebKit; navigation then creates the one required visible pipeline.

This preserves the measured fast-link hover gain while avoiding speculative
media transfer where it is most likely to hurt. The remaining constrained-link
timing variation also occurred with no preload request and is therefore part of
the MP4 seek / network tail rather than duplicate ownership.

## Rejected experiment: size-neutral five-second GOP

A second encoding pass tested whether a shorter keyframe interval could fit
inside the published HQ desktop payload by raising CRF:

- Five-second GOP / CRF 28: 24.54 MB, still 7.6% larger than published; SSIM
  0.9797 and average PSNR 40.34 dB against the original.
- Five-second GOP / CRF 30: 20.75 MB, 9.0% smaller than published; SSIM 0.9714
  and average PSNR 38.65 dB.
- Published file: 22.80 MB; SSIM 0.9888 and average PSNR 43.37 dB.

Decision: reject both candidates. CRF 28 does not solve transfer size and CRF
30 gives up substantially more image fidelity for a modest size reduction. No
media object or checked-in asset was changed.

## Iteration 8: make viewport handoffs reversible

A desktop to mobile to desktop trace showed the reverse handoff issuing the
same desktop metadata and synchronized range requests again. Chromium did not
reuse the partial MP4 response after React discarded the original element; the
second desktop frame took 15.20 seconds in that sample even though the first
desktop and mobile frames were fast.

The controller now keeps only the just-replaced viewport element for five
seconds, paused and muted. A quick orientation bounce promotes that decoded
element instead of redownloading, while the reserve is removed automatically
and steady state returns to one element. Only one video is ever playing or
audible. In the paired production sample, desktop to mobile completed in 273 ms
and the immediate return to desktop dropped from 15.20 seconds to 81 ms.

Slow synchronized seeks also get a per-element settle window. Once one range
seek has decoded a valid frame, the controller reveals it instead of repeatedly
chasing a wall clock that advanced while the seek was in flight; the regular
sync watchdog corrects residual drift afterward. Five repeated Chrome
mobile/desktop round trips passed with one playing pipeline and automatic
reserve cleanup.

Initial video loading now also distinguishes an active post-metadata range
request from a missing or failed source. The former gets a bounded ten-second
grace period instead of being restarted at 4.5 seconds, avoiding self-inflicted
reload loops on slower links. Normal cross-browser checks run one browser at a
time so CDN timing represents one visitor; the 20-minute soak explicitly keeps
Chrome, Firefox, and WebKit concurrent for sustained-load coverage.

A forced-GC cleanup audit completed 30 desktop/mobile round trips. Baseline was
498 DOM nodes, 414 JavaScript listeners, one video, and 4.72 MB used heap. While
the final reserve was intentionally alive this rose to 648 nodes, 440 listeners,
two videos, and 5.03 MB, with only one video playing. Six seconds later it
returned to 500 nodes, 415 listeners, and one playing video; used heap remained
5.03 MB. The reserve therefore cleans up its DOM/listener footprint rather than
accumulating a pipeline per orientation change.

## Rejected experiment: shorter MP4 keyframe intervals

The published HQ H.264 files have a 10.417-second fixed keyframe interval.
Versioned candidates were encoded directly from the local masters with CRF 24,
fast-start metadata, and fixed five-second and two-second keyframe intervals.
No live object was overwritten.

Results:

- Five-second desktop: 33.6 MB versus 22.8 MB published (+48%).
- Five-second mobile: 42.1 MB versus 27.2 MB published (+55%).
- Two-second desktop: 66.3 MB; two-second mobile: 86.6 MB.
- Across 17 random local seeks, the five-second candidate changed desktop p95
  single-frame decode from 112.3 ms to 103.7 ms and mobile p95 from 155.2 ms to
  140.9 ms, with no average-time improvement.

Decision: reject the shorter-GOP candidates. Their object-size, transfer, and
cache-pressure costs outweigh the modest tail improvement. Keep the immediate
destination mount and bounded intent warming, which attack perceived latency
without tripling the media payload.

## Audio reliability iteration 1: playlist watchdog

Hypothesis: a 30-second sync check is too slow for an unexpected pause or network stall, and the existing status omits several useful media events.

Implementation:

- Record `canplay`, `playing`, `pause`, `waiting`, `stalled`, `suspend`, `abort`, and `emptied` events.
- Check active, unmuted playlist progress every two seconds.
- Retry an unexpected pause immediately at the correct synchronized track/time.
- Force a source reload on later attempts, with capped exponential backoff.
- Retry on online, focus, and visibility return, while doing nothing when the playlist is intentionally muted or the browser is offline/hidden.

Result in Chromium failure injection:

- Unexpected playlist pause: resumed in about 1.39 seconds at synchronized playback position.
- Broken playlist source: original HQ source restored and playing in about 2.37 seconds after one media error.

## Audio reliability iteration 2: room video watchdog

Hypothesis: once a room video passes its initial readiness check, a later stall or pause has no active recovery path.

Implementation:

- Track visible-video progress and media events independently from playlist audio.
- Check every two seconds for unexpected pause, error, missing source, or five seconds without progress.
- Retry playback and synchronized seeking before using a destructive `load()` recovery.
- Show the existing loading veil only when the later recovery reaches the reload tier.
- Retry on online, focus, and visibility return with capped backoff.

Result in Chromium failure injection:

- Unexpected visible-video pause: resumed in about 0.53 seconds.
- Broken visible-video source: expected synchronized room source restored and playing in about 1.54 seconds after one media error.

Later production-suite concurrency exposed Chromium retaining
`NETWORK_NO_SOURCE` after a transient range failure even though the element's
URL was already correct. Reload-tier recovery now clears the source and media
resource state before assigning the expected URL again. Fifteen repeated
failure-injection runs (five per Chrome, Firefox, and WebKit) each aborted the
first request for the expected TV-room URL and recovered on the next request.
The per-element seek-settle timestamp is cleared with every destructive source
reload, so the first synchronized seek after recovery cannot be suppressed;
five consecutive WebKit dual-source recovery runs restored the HQ video within
three seconds of its expected global position.

## Audio reliability iteration 3: preserve the trusted Enter gesture

The playlist provider previously waited for metadata before its first unmuted
`play()` call. On a slow response that can move the call outside Safari's
transient user-activation window even though the visitor explicitly pressed
Enter.

The persistent playlist element now requests playback synchronously in the
Enter/click call stack. Its volume stays at zero until metadata is ready and
the global synchronized position has been applied, then the requested mix
volume is restored. Request IDs are checked again before restoring gain so a
stale room load cannot make a newer track audible.

The regression test holds every MP3 request before metadata, presses Enter,
and verifies that the audio element has already received `play()` before any
request is released. It then releases the requests and verifies synchronized,
unmuted playback at the configured volume in Chrome, Firefox, and WebKit.

A concurrent production-build run also exposed recovery requests being
mistaken for clock drift while their correct source was still loading. The
watchdog now gives an in-flight target source up to ten seconds to reach
current data before it may reload it. A second cross-browser injection holds
the restored HQ MP3 for 5.5 seconds and verifies exactly one request, then
releases it and verifies healthy dual playback.

## Dual-audio concurrency check

Published HQ settings intentionally set room/video audio to 0, so the browser test intercepted only the local settings response and supplied room/video volume 0.8 while leaving playlist volume 0.71. R2 was not modified.

Results:

- Visible HQ video: playing, unmuted, volume 0.8, ready state 4.
- HQ playlist: playing, unmuted, volume 0.71, ready state 4.
- Over a 4.38-second sample, video advanced 4.38 seconds and playlist advanced 4.38 seconds.
- While playlist audio was forcibly paused, video continued and playlist recovered; both were playing afterward.
- While video was forcibly paused, playlist continued and video recovered; both were playing afterward.
- HQ video contains stereo AAC audio at 48 kHz.
- The sampled HQ playlist file contains stereo MP3 audio at 44.1 kHz.

### Cross-browser endurance result

- Google Chrome: 20-minute dual-audio soak passed.
- Playwright Firefox: 20-minute dual-audio soak passed.
- Playwright WebKit: 20-minute dual-audio soak passed.
- All three ran concurrently with five-second health samples.
- All three passed offline pause plus online recovery at 50% elapsed time.
- All three passed simultaneous invalid video and playlist source restoration at 75% elapsed time.
- Final result: 3 passed in 20.3 minutes.
- A second latest-production-build run passed 3/3 in 20.1 minutes with the same
  continuous sampling, offline recovery, and simultaneous broken-source
  restoration.

Headless Chrome, Firefox, and WebKit all keep `document.visibilityState` as
`visible` when another headless page is opened, so that action is not counted as
real background coverage. A standards-level synthetic hidden/visible test that
pauses both streams and requires recovery on `visibilitychange` passes in all
three engines. The corrected production-build soak passed 3/3 in 20.2 minutes
with explicit visibility recovery at 25%, offline recovery at 50%, simultaneous
broken-source restoration at 75%, and continuous five-second sampling.

After the trusted-gesture, in-flight-load, hard-reset, and reversible viewport
iterations, the complete soak was rerun on commit `1306461`: Chrome, Firefox,
and WebKit again passed 3/3 in 20.2 minutes with all three injections and
continuous dual-clock advancement.

After the final WebKit destructive-reload resync correction, a final-branch
10-minute soak repeated the same three injections and continuous sampling. It
passed Chrome, Firefox, and WebKit 3/3 in 10.2 minutes.

The final production matrix reports 49 passed and 2 expected skips with retries
disabled. The
skips are the Chromium-only DevTools lifecycle case in Firefox and WebKit;
Chrome passed an actual three-second frozen-page lifecycle and recovered both
streams.

Native Safari WebDriver was attempted, but macOS reported that Safari's **Allow remote automation** setting is disabled. WebKit coverage is therefore automated; native Safari remains an explicit manual verification boundary.

## Iteration after soak: room ownership race

Repeated room cycling exposed two related ownership issues:

- A room whose playlist was enabled but had zero active tracks could report playlist audio as active and re-unmute the now-empty shared audio element after stopping it.
- A navigation that landed while the initial R2 manifest request was resolving could update the visible room before `sceneSlugRef` updated, allowing the late manifest response to restore the stale previous room.

Fixes:

- Playlist audio is active only when an active track exists.
- The canonical scene ref is updated synchronously in the navigation transaction before React state and before any pending manifest response can read it.

Result: the rapid Construction / TV / Construction / Hole / Construction / HQ
cycle passes in Chrome, Firefox, and WebKit. Ten concurrent Chrome repetitions of
the transition plus offline-return path also pass.

## Iteration after soak: one steady-state video pipeline

Rapid room cycling showed that every room mounted both its desktop and mobile
video even though only one could be visible. Intent preloading could add a third
media pipeline during navigation.

Implementation:

- Mount only the preferred viewport variant in steady state.
- During an actual viewport/orientation change, retain the old variant until the
  replacement has decoded a frame, then remove it.
- Consume and release a detached intent preloader when navigation begins so it
  cannot compete with the visible video for range requests or a decoder.
- Keep the previous video audible until viewport replacement is frame-ready.

Results:

- The previously failing rapid Chrome room cycle now completes in 5.2 seconds.
- Steady-state video elements per room dropped from two to one.
- A 250 ms desktop hover warm-up produced a 268.5 ms HQ ready time in a fresh
  Chromium context versus 462.8 ms without hover in the same sample series.
- Desktop to mobile to desktop source handoff passes in Chrome, Firefox, and
  WebKit, with one steady-state element after each handoff and playlist audio
  continuing through the change.

## Audio reliability iteration 3: stale request ownership

The cross-browser matrix exposed a race where an old muted transition request
could finish after the current unmuted playlist request and mute the shared
audio element again. The media service already owns request sequencing, so the
controller's redundant post-request mixer writes were removed.

Result: ten concurrent Chrome repetitions pass, followed by a clean 12/12
Chrome, Firefox, and WebKit quick matrix covering dual playback, independent
recovery, offline return, and room cycling.

## Admin room overview

- Added a read-only React Flow overview as the default admin section.
- Nodes are generated from the shared room registry and live R2 hotspot, playlist, and settings manifests.
- Directional desktop/mobile hotspot and overlay connections are deduplicated; two-way paths are combined visually.
- The graph uses a deterministic layout that expands from two to three columns as the room count grows and adds a minimap only beyond six rooms.
- Admin navigation, spacing, width, header hierarchy, and responsive tab behavior were refined without changing publishing workflows.
- Compact screens use a vertically growing one-column graph instead of shrinking
  two columns below legible text size; this layout scales to the planned nine
  rooms without horizontal page overflow.
- Non-interactive graph elements are removed from keyboard focus, and the admin
  tabs implement roving focus with Left/Right/Home/End navigation.
- React Flow JavaScript remains isolated to the admin route. Its 15 KB
  production stylesheet was moved to an admin-only nested layout, reducing the
  public room CSS payload from 58 KB to 43 KB while preserving the graph render.
- The overview reports hotspot, playlist, and settings sources independently
  (`3/3 R2` or partial fallback) instead of inferring all three from hotspots.
- Production room hotspots remain keyboard/screen-reader links when debug
  outlines are hidden, and the entry artwork exposes one keyboard action rather
  than three duplicate buttons.
