import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { DEFAULT_STAGE_TRANSFORM, WHEEL_ZOOM_SPEED } from "./constants";
import {
  clampStageTransform,
  getNormalizedWheelDelta,
  getPointerCenter,
  getPointerDistance,
  getStageZoomTransform,
} from "./stage-utils";
import type {
  NativeGestureEvent,
  PointerPosition,
  StageGesture,
  StagePointer,
  StageTransform,
} from "./types";
import { isInteractiveTarget } from "./ui";

type UseStageGesturesOptions = {
  debugHotspots: boolean;
  onDebugPointerChange: Dispatch<SetStateAction<PointerPosition | null>>;
};

export function useStageGestures({
  debugHotspots,
  onDebugPointerChange,
}: UseStageGesturesOptions) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageTransform, setStageTransform] = useState<StageTransform>(
    DEFAULT_STAGE_TRANSFORM,
  );
  const stageTransformRef = useRef(DEFAULT_STAGE_TRANSFORM);
  const stageGestureRef = useRef<StageGesture>({
    pointers: new Map(),
    startCenter: null,
    startDistance: 0,
    startTransform: DEFAULT_STAGE_TRANSFORM,
  });
  const nativeGestureStartRef = useRef<{
    point: StagePointer;
    transform: StageTransform;
  } | null>(null);

  const stageTransformStyle = useMemo(
    () => ({
      transform: `translate3d(${stageTransform.x}px, ${stageTransform.y}px, 0) scale(${stageTransform.scale})`,
    }),
    [stageTransform.scale, stageTransform.x, stageTransform.y],
  );

  function resetStageTransform() {
    stageGestureRef.current.pointers.clear();
    stageGestureRef.current.startCenter = null;
    stageGestureRef.current.startDistance = 0;
    stageGestureRef.current.startTransform = DEFAULT_STAGE_TRANSFORM;
    stageTransformRef.current = DEFAULT_STAGE_TRANSFORM;
    setStageTransform(DEFAULT_STAGE_TRANSFORM);
  }

  function handleFramePointer(event: React.PointerEvent<HTMLDivElement>) {
    if (!debugHotspots || event.target !== event.currentTarget) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    onDebugPointerChange({
      x: Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(2)),
      y: Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(2)),
    });
  }

  function setClampedStageTransform(nextTransform: StageTransform) {
    const clampedTransform = clampStageTransform(
      nextTransform,
      stageRef.current?.getBoundingClientRect() ?? null,
    );

    stageTransformRef.current = clampedTransform;
    setStageTransform(clampedTransform);
  }

  function getStagePointer(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();

    return {
      x: event.clientX - rect.left - rect.width / 2,
      y: event.clientY - rect.top - rect.height / 2,
    };
  }

  function getStagePointerFromClient(clientX: number, clientY: number) {
    const rect = stageRef.current?.getBoundingClientRect();

    if (!rect) {
      return null;
    }

    return {
      x: clientX - rect.left - rect.width / 2,
      y: clientY - rect.top - rect.height / 2,
    };
  }

  function getStageCenterPointer() {
    return { x: 0, y: 0 };
  }

  function zoomStageAt(
    startTransform: StageTransform,
    startPoint: StagePointer,
    currentPoint: StagePointer,
    nextScale: number,
  ) {
    setClampedStageTransform(
      getStageZoomTransform(startTransform, startPoint, currentPoint, nextScale),
    );
  }

  function resetStageGesture() {
    stageGestureRef.current.pointers.clear();
    stageGestureRef.current.startCenter = null;
    stageGestureRef.current.startDistance = 0;
    stageGestureRef.current.startTransform = stageTransformRef.current;
  }

  function handleStagePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    handleFramePointer(event);

    if (isInteractiveTarget(event.target)) {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    const gesture = stageGestureRef.current;
    const pointer = getStagePointer(event);
    gesture.pointers.set(event.pointerId, pointer);

    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    const pointers = Array.from(gesture.pointers.values());
    gesture.startTransform = stageTransformRef.current;

    if (pointers.length >= 2) {
      gesture.startCenter = getPointerCenter(pointers[0], pointers[1]);
      gesture.startDistance = getPointerDistance(pointers[0], pointers[1]);
      return;
    }

    gesture.startCenter = pointer;
    gesture.startDistance = 0;
  }

  function handleStagePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = stageGestureRef.current;

    if (!gesture.pointers.has(event.pointerId)) {
      return;
    }

    gesture.pointers.set(event.pointerId, getStagePointer(event));
    const pointers = Array.from(gesture.pointers.values());

    if (pointers.length >= 2 && gesture.startCenter) {
      const currentCenter = getPointerCenter(pointers[0], pointers[1]);
      const currentDistance = getPointerDistance(pointers[0], pointers[1]);
      const distanceRatio =
        gesture.startDistance > 0
          ? currentDistance / gesture.startDistance
          : 1;
      const nextScale = gesture.startTransform.scale * distanceRatio;

      event.preventDefault();
      zoomStageAt(
        gesture.startTransform,
        gesture.startCenter,
        currentCenter,
        nextScale,
      );
      return;
    }

    if (pointers.length === 1) {
      return;
    }
  }

  function handleStagePointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = stageGestureRef.current;
    gesture.pointers.delete(event.pointerId);

    if (event.currentTarget.releasePointerCapture) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // The pointer may already be released after a browser-level cancel.
      }
    }

    const pointers = Array.from(gesture.pointers.values());

    if (pointers.length >= 2) {
      gesture.startTransform = stageTransformRef.current;
      gesture.startCenter = getPointerCenter(pointers[0], pointers[1]);
      gesture.startDistance = getPointerDistance(pointers[0], pointers[1]);
      return;
    }

    if (pointers.length === 1) {
      gesture.startTransform = stageTransformRef.current;
      gesture.startCenter = pointers[0];
      gesture.startDistance = 0;
      return;
    }

    resetStageGesture();
  }

  useEffect(() => {
    stageTransformRef.current = stageTransform;
  }, [stageTransform]);

  useEffect(() => {
    const stage = stageRef.current;

    if (!stage) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        const currentTransform = stageTransformRef.current;

        if (currentTransform.scale <= 1.001) {
          return;
        }

        event.preventDefault();
        resetStageGesture();
        nativeGestureStartRef.current = null;

        const delta = getNormalizedWheelDelta(event);

        setClampedStageTransform({
          ...currentTransform,
          x: currentTransform.x - delta.x,
          y: currentTransform.y - delta.y,
        });
        return;
      }

      const pointer = getStagePointerFromClient(event.clientX, event.clientY);

      if (!pointer) {
        return;
      }

      event.preventDefault();
      resetStageGesture();
      nativeGestureStartRef.current = null;

      const currentTransform = stageTransformRef.current;
      const nextScale =
        currentTransform.scale * Math.exp(-event.deltaY * WHEEL_ZOOM_SPEED);

      zoomStageAt(currentTransform, pointer, pointer, nextScale);
    };

    const handleGestureStart = (event: Event) => {
      const gestureEvent = event as NativeGestureEvent;
      const pointer =
        typeof gestureEvent.clientX === "number" &&
        typeof gestureEvent.clientY === "number"
          ? getStagePointerFromClient(gestureEvent.clientX, gestureEvent.clientY)
          : getStageCenterPointer();

      event.preventDefault();
      resetStageGesture();
      nativeGestureStartRef.current = {
        point: pointer ?? getStageCenterPointer(),
        transform: stageTransformRef.current,
      };
    };

    const handleGestureChange = (event: Event) => {
      const gestureEvent = event as NativeGestureEvent;
      const start = nativeGestureStartRef.current;
      const scale = Number(gestureEvent.scale);

      if (!start || !Number.isFinite(scale)) {
        return;
      }

      const currentPoint =
        typeof gestureEvent.clientX === "number" &&
        typeof gestureEvent.clientY === "number"
          ? getStagePointerFromClient(gestureEvent.clientX, gestureEvent.clientY)
          : start.point;

      event.preventDefault();
      zoomStageAt(
        start.transform,
        start.point,
        currentPoint ?? start.point,
        start.transform.scale * scale,
      );
    };

    const handleGestureEnd = (event: Event) => {
      event.preventDefault();
      nativeGestureStartRef.current = null;
      resetStageGesture();
    };

    stage.addEventListener("wheel", handleWheel, { passive: false });
    stage.addEventListener("gesturestart", handleGestureStart, {
      passive: false,
    });
    stage.addEventListener("gesturechange", handleGestureChange, {
      passive: false,
    });
    stage.addEventListener("gestureend", handleGestureEnd, { passive: false });

    return () => {
      stage.removeEventListener("wheel", handleWheel);
      stage.removeEventListener("gesturestart", handleGestureStart);
      stage.removeEventListener("gesturechange", handleGestureChange);
      stage.removeEventListener("gestureend", handleGestureEnd);
    };
  });

  return {
    handleStagePointerDown,
    handleStagePointerEnd,
    handleStagePointerMove,
    resetStageTransform,
    stageRef,
    stageTransformStyle,
  };
}
