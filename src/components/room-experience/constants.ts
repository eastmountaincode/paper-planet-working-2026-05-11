import type { StageTransform } from "./types";

export const ROOM_TRANSITION_MS = 200;
export const ROOT_HREF = "/";
export const DEFAULT_STAGE_TRANSFORM: StageTransform = { scale: 1, x: 0, y: 0 };
export const MAX_STAGE_SCALE = 3;
export const WHEEL_ZOOM_SPEED = 0.006;
export const WHEEL_LINE_PIXELS = 16;
export const PLAYLIST_METADATA_TOAST_MS = 6200;
export const LOADING_PREVIEW_MS = 3200;
export const LOADING_GIF_SRC = "/loading/paper-planet-loading.gif";
export const VIDEO_READY_CHECK_MS = 700;
export const VIDEO_LOAD_RECOVERY_MS = 4500;
export const VIDEO_LOAD_RECOVERY_LIMIT = 2;
export const helperUnlockStorageKey = "paper-planet-helper-unlocked";
export const helperDebugParam = "debug";
export const helperUnlockedByDefault = process.env.NODE_ENV !== "production";
