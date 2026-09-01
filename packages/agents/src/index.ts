export {
  ASSISTANT_ROUTES,
  AssistantError,
  DEFAULT_ASSISTANT_MODEL,
  askAssistant,
  buildAssistantSystemPrompt,
  validateAssistantReply,
} from "./assistant.js";
export type {
  AskAssistantOptions,
  AssistantAction,
  AssistantActionType,
  AssistantReply,
} from "./assistant.js";

export {
  buildShotPrompt,
  DirectorPlanError,
  planShots,
} from "./director.js";
export type { ChatClient, PlanShotsOptions, Shot, ShotPlan } from "./director.js";

export {
  MarketingPlanError,
  MarketingScrapeError,
  proposeCreativeDirection,
  scrapeProductPage,
} from "./marketing.js";
export type {
  CreativeStyle,
  MarketingDirection,
  ProductInfo,
  ProposeCreativeDirectionOptions,
  ScrapeOptions,
} from "./marketing.js";
