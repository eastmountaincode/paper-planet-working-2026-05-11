type ManifestResult = {
  manifest?: unknown;
  source?: "r2" | "static";
};

export type RuntimeManifestBundle = {
  hotspots?: ManifestResult;
  playlists?: ManifestResult;
  settings?: ManifestResult;
};

let runtimeManifestRequest: Promise<RuntimeManifestBundle> | null = null;

export function fetchRuntimeManifestBundle() {
  if (runtimeManifestRequest) {
    return runtimeManifestRequest;
  }

  runtimeManifestRequest = fetch("/api/runtime", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("Could not load runtime manifests.");
      }

      return (await response.json()) as RuntimeManifestBundle;
    })
    .catch((error: unknown) => {
      runtimeManifestRequest = null;
      throw error;
    });

  return runtimeManifestRequest;
}
