export const planetEnteredStorageKey = "paper-planet-entered";

export function hasEnteredPlanet() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.sessionStorage.getItem(planetEnteredStorageKey) === "1";
}

export function markPlanetEntered() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(planetEnteredStorageKey, "1");
}
