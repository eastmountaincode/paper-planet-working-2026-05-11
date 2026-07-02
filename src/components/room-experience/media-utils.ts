export function isExpectedMediaInterruption(error: unknown) {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return error.name === "AbortError";
}

export function getMediaErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
