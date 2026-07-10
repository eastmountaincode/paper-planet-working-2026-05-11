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

Long multi-browser soak tests are still required.

## Admin room overview

- Added a read-only React Flow overview as the default admin section.
- Nodes are generated from the shared room registry and live R2 hotspot, playlist, and settings manifests.
- Directional desktop/mobile hotspot and overlay connections are deduplicated; two-way paths are combined visually.
- The graph uses a deterministic layout that expands from two to three columns as the room count grows and adds a minimap only beyond six rooms.
- Admin navigation, spacing, width, header hierarchy, and responsive tab behavior were refined without changing publishing workflows.
