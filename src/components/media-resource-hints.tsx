"use client";

import ReactDOM from "react-dom";

const mediaBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL;

export function MediaResourceHints() {
  if (mediaBaseUrl) {
    const mediaOrigin = new URL(mediaBaseUrl).origin;

    ReactDOM.prefetchDNS(mediaOrigin);
    ReactDOM.preconnect(mediaOrigin);
  }

  return null;
}
