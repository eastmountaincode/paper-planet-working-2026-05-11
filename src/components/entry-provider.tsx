"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type EntryContextValue = {
  hasEntered: boolean;
  markEntered: () => void;
};

const EntryContext = createContext<EntryContextValue | null>(null);

export function EntryProvider({ children }: { children: ReactNode }) {
  const [hasEntered, setHasEntered] = useState(false);

  const markEntered = useCallback(() => {
    setHasEntered(true);
  }, []);

  const value = useMemo(
    () => ({
      hasEntered,
      markEntered,
    }),
    [hasEntered, markEntered],
  );

  return (
    <EntryContext.Provider value={value}>{children}</EntryContext.Provider>
  );
}

export function useEntryState() {
  const value = useContext(EntryContext);

  if (!value) {
    throw new Error("useEntryState must be used inside EntryProvider");
  }

  return value;
}
