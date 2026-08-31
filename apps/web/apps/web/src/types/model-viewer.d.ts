import type { DetailedHTMLProps, HTMLAttributes } from "react";

/**
 * `<model-viewer>` is a custom element, so JSX has no idea it exists. This
 * declares the handful of attributes we actually pass rather than typing the
 * whole element surface — an inaccurate broad declaration would be worse than
 * a narrow honest one.
 */
declare global {
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

export {};
