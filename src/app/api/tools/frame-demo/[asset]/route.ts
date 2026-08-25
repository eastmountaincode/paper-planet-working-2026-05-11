import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DemoAsset = {
  contentType: string;
  filePath: string;
};

function getDemoAssets(): Record<string, DemoAsset> {
  const phaseTwoRoot = path.join(
    /* turbopackIgnore: true */ process.cwd(),
    "..",
    "assets",
    "phase2",
  );

  return {
    "home-landscape": {
      contentType: "video/quicktime",
      filePath: `${phaseTwoRoot}/_TEMP home - Landscape-001.mov`,
    },
    "green-landscape": {
      contentType: "video/mp4",
      filePath: `${phaseTwoRoot}/Phase 4/ROOMS/GREEN ROOM - Landscape.MP4`,
    },
    "green-portrait": {
      contentType: "video/mp4",
      filePath: `${phaseTwoRoot}/Phase 4/ROOMS/GREEN ROOM - Vertical.MP4`,
    },
  };
}

function parseRange(rangeHeader: string, fileSize: number) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());

  if (!match || (!match[1] && !match[2])) {
    return null;
  }

  if (!match[1]) {
    const suffixLength = Number(match[2]);

    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }

    return {
      start: Math.max(fileSize - suffixLength, 0),
      end: fileSize - 1,
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= fileSize ||
    requestedEnd < start
  ) {
    return null;
  }

  return {
    start,
    end: Math.min(requestedEnd, fileSize - 1),
  };
}

async function getAsset(assetKey: string) {
  const asset = getDemoAssets()[assetKey];

  if (!asset) {
    return null;
  }

  try {
    const file = await stat(/* turbopackIgnore: true */ asset.filePath);

    if (!file.isFile()) {
      return null;
    }

    return { ...asset, size: file.size };
  } catch {
    return null;
  }
}

function baseHeaders(asset: DemoAsset, size: number) {
  return {
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0, must-revalidate",
    "Content-Length": String(size),
    "Content-Type": asset.contentType,
  };
}

export async function HEAD(
  _request: NextRequest,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset: assetKey } = await params;
  const asset = await getAsset(assetKey);

  if (!asset) {
    return new Response(null, { status: 404 });
  }

  return new Response(null, {
    headers: baseHeaders(asset, asset.size),
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ asset: string }> },
) {
  const { asset: assetKey } = await params;
  const asset = await getAsset(assetKey);

  if (!asset) {
    return new Response("Demo video not found", { status: 404 });
  }

  const rangeHeader = request.headers.get("range");

  if (!rangeHeader) {
    const stream = createReadStream(
      /* turbopackIgnore: true */ asset.filePath,
    );

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: baseHeaders(asset, asset.size),
    });
  }

  const range = parseRange(rangeHeader, asset.size);

  if (!range) {
    return new Response(null, {
      status: 416,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Range": `bytes */${asset.size}`,
      },
    });
  }

  const contentLength = range.end - range.start + 1;
  const stream = createReadStream(
    /* turbopackIgnore: true */ asset.filePath,
    range,
  );

  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 206,
    headers: {
      ...baseHeaders(asset, contentLength),
      "Content-Range": `bytes ${range.start}-${range.end}/${asset.size}`,
    },
  });
}
