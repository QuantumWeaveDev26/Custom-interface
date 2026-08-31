"use client";

import { useEffect, useRef, useState } from "react";

/**
 * An inline preview for a generated .glb mesh.
 *
 * Two things shape this component.
 *
 * A mesh is around 25 MB, and a gallery can show dozens of them. Loading a
 * viewer for each one on sight would download hundreds of megabytes to render
 * thumbnails nobody asked to inspect, so the viewer only mounts when the user
 * asks for it, and the library that renders it is imported at that moment
 * rather than shipped in the page bundle.
 *
 * `<model-viewer>` is a custom element, so React only needs to render the tag
 * once the definition is registered. Until then the tag would render as an
 * empty unknown element — hence the explicit ready state rather than rendering
 * optimistically.
 */
export function MeshViewer({ assetId }: { assetId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">(
    "idle",
  );
  // Survives unmount: the custom element registry is global, so a second mesh
  // must not re-import or re-register.
  const started = useRef(false);

  useEffect(() => {
    if (state !== "loading" || started.current) return;
    started.current = true;

    let cancelled = false;
    void import("@google/model-viewer")
      .then(() => {
        if (!cancelled) setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state === "idle") {
    return (
      <button
        type="button"
        onClick={() => setState("loading")}
        className="btn-secondary !px-3 !py-1.5 text-xs"
      >
        Preview in 3D
      </button>
    );
  }

  if (state === "loading") {
    return (
      <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <span className="spinner h-3 w-3" aria-hidden="true" />
        Loading viewer…
      </span>
    );
  }

  if (state === "failed") {
    // The mesh is still downloadable; only the preview is unavailable, and
    // saying which is the difference between a broken page and a missing extra.
    return (
      <p className="text-xs text-[var(--text-muted)]">
        The 3D preview could not load. The mesh itself is fine — download it.
      </p>
    );
  }

  return (
    <model-viewer
      src={`/api/assets/${assetId}`}
      alt="Generated 3D mesh"
      camera-controls
      touch-action="pan-y"
      auto-rotate
      shadow-intensity="1"
      exposure="1"
      style={{
        width: "100%",
        height: "100%",
        minHeight: "16rem",
        backgroundColor: "var(--bg-elevated)",
        borderRadius: "10px",
      }}
    />
  );
}
