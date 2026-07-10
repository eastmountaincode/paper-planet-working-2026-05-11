import type { Scene } from "@/lib/scenes";

export type PointerPosition = {
  x: number;
  y: number;
};

export type StageTransform = {
  scale: number;
  x: number;
  y: number;
};

export type StagePointer = {
  x: number;
  y: number;
};

export type StageGesture = {
  pointers: Map<number, StagePointer>;
  startCenter: StagePointer | null;
  startDistance: number;
  startTransform: StageTransform;
};

export type PlaylistTrack = NonNullable<Scene["playlist"]>["tracks"][number];

export type NativeGestureEvent = Event & {
  clientX?: number;
  clientY?: number;
  scale?: number;
};
