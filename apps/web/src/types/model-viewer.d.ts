import type { DetailedHTMLProps, HTMLAttributes } from "react";

/**
 * `<model-viewer>` is a custom element, so JSX has no idea it exists.
 *
 * React 19 moved the JSX namespace under `react`, so augmenting the old global
 * `JSX` has no effect. Only the attributes actually passed are declared — a
 * broad inaccurate declaration would be worse than a narrow honest one.
 */
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src: string;
          alt?: string;
          "camera-controls"?: boolean;
          "auto-rotate"?: boolean;
          "touch-action"?: string;
          "shadow-intensity"?: string;
          exposure?: string;
        },
        HTMLElement
      >;
    }
  }
}
