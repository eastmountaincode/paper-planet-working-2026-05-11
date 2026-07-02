import { useCallback, useEffect, useRef, useState } from "react";
import { LOADING_PREVIEW_MS } from "./constants";

export function useLoadingPreview() {
  const [loadingPreviewVisible, setLoadingPreviewVisible] = useState(false);
  const loadingPreviewTimeoutRef = useRef<number | null>(null);

  const showLoadingPreview = useCallback(() => {
    setLoadingPreviewVisible(true);

    if (loadingPreviewTimeoutRef.current) {
      window.clearTimeout(loadingPreviewTimeoutRef.current);
    }

    loadingPreviewTimeoutRef.current = window.setTimeout(() => {
      setLoadingPreviewVisible(false);
      loadingPreviewTimeoutRef.current = null;
    }, LOADING_PREVIEW_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (loadingPreviewTimeoutRef.current) {
        window.clearTimeout(loadingPreviewTimeoutRef.current);
      }
    };
  }, []);

  return {
    loadingPreviewVisible,
    showLoadingPreview,
  };
}
