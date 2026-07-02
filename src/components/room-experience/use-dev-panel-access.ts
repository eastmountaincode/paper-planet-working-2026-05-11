import { useCallback, useEffect, useState } from "react";
import {
  helperDebugParam,
  helperUnlockStorageKey,
  helperUnlockedByDefault,
} from "./constants";
import { isTypingTarget } from "./ui";

type SearchParamsLike = {
  get(name: string): string | null;
};

export function useDevPanelAccess(searchParams: SearchParamsLike) {
  const debugParamValue = searchParams.get(helperDebugParam);
  const helperUnlockedByUrl = debugParamValue === "true";
  const helperLockedByUrl = debugParamValue === "false";
  const helperInitiallyUnlocked = helperUnlockedByDefault || helperUnlockedByUrl;
  const [devPanelUnlocked, setDevPanelUnlocked] = useState(
    helperInitiallyUnlocked,
  );
  const [devPanelOpen, setDevPanelOpen] = useState(helperInitiallyUnlocked);
  const [devBordersEnabled, setDevBordersEnabled] = useState(
    helperUnlockedByUrl && searchParams.get("dev") === "1",
  );
  const debugHotspots =
    devPanelUnlocked &&
    (searchParams.get("hotspots") === "1" || helperUnlockedByUrl);
  const devBorders = devBordersEnabled && helperUnlockedByUrl;
  const helperShortcutEnabled = devPanelUnlocked && helperUnlockedByUrl;

  const toggleDevPanel = useCallback(() => {
    setDevPanelOpen((current) => !current);
  }, []);

  useEffect(() => {
    if (helperUnlockedByDefault) {
      return undefined;
    }

    const syncHelperUnlock = window.setTimeout(() => {
      if (helperLockedByUrl) {
        window.localStorage.removeItem(helperUnlockStorageKey);
        setDevPanelUnlocked(false);
        setDevPanelOpen(false);
        setDevBordersEnabled(false);
        return;
      }

      if (helperUnlockedByUrl) {
        window.localStorage.setItem(helperUnlockStorageKey, "1");
        setDevPanelUnlocked(true);
        setDevPanelOpen(true);
        return;
      }

      const storedUnlock =
        window.localStorage.getItem(helperUnlockStorageKey) === "1";

      setDevPanelUnlocked(storedUnlock);
    }, 0);

    return () => {
      window.clearTimeout(syncHelperUnlock);
    };
  }, [helperLockedByUrl, helperUnlockedByUrl]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        isTypingTarget(event.target)
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (!devPanelUnlocked) {
        return;
      }

      if (!helperShortcutEnabled) {
        return;
      }

      if (key === "b") {
        setDevBordersEnabled((current) => !current);
      }

      if (key === "h") {
        setDevPanelOpen((current) => !current);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [devPanelUnlocked, helperShortcutEnabled]);

  return {
    debugHotspots,
    devBorders,
    devPanelOpen,
    helperShortcutEnabled,
    toggleDevPanel,
  };
}
