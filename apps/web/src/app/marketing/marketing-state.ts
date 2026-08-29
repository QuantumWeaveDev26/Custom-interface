export interface MarketingProduct {
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
}

export type MarketingCreativeStyle = "ugc" | "cgi" | "cinematic";

export interface MarketingDirectionResult {
  style: MarketingCreativeStyle;
  tagline: string;
  prompt: string;
  cameraLabel: string;
  lensLabel: string;
  lookLabel: string;
  composedPrompt: string;
}

export type MarketingPhase = "idle" | "planning" | "planned" | "failed";

export interface MarketingState {
  url: string;
  phase: MarketingPhase;
  product: MarketingProduct | null;
  direction: MarketingDirectionResult | null;
  errorMessage: string | null;
}

export const INITIAL_MARKETING_STATE: MarketingState = {
  url: "",
  phase: "idle",
  product: null,
  direction: null,
  errorMessage: null,
};

export type MarketingAction =
  | { type: "SET_URL"; url: string }
  | { type: "PLAN_START" }
  | { type: "PLAN_SUCCESS"; product: MarketingProduct; direction: MarketingDirectionResult }
  | { type: "PLAN_ERROR"; message: string };

export function marketingReducer(
  state: MarketingState,
  action: MarketingAction,
): MarketingState {
  switch (action.type) {
    case "SET_URL":
      return { ...state, url: action.url };
    case "PLAN_START":
      return { ...state, phase: "planning", errorMessage: null, product: null, direction: null };
    case "PLAN_SUCCESS":
      return {
        ...state,
        phase: "planned",
        product: action.product,
        direction: action.direction,
        errorMessage: null,
      };
    case "PLAN_ERROR":
      return { ...state, phase: "failed", errorMessage: action.message, product: null, direction: null };
    default:
      return state;
  }
}
