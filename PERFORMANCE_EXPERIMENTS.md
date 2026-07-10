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
- All three passed background/foreground return at 25% elapsed time.
- All three passed offline pause plus online recovery at 50% elapsed time.
- All three passed simultaneous invalid video and playlist source restoration at 75% elapsed time.
- Final result: 3 passed in 20.3 minutes.

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
