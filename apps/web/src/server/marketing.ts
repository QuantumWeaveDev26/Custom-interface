import { createModelArkClient } from "@creative-ai/modelark-client";
import {
  proposeCreativeDirection,
  scrapeProductPage,
  type MarketingDirection,
  type ProductInfo,
} from "@creative-ai/agents";
import {
  getCameraPreset,
  getLensPreset,
  getLookPreset,
} from "@creative-ai/prompt-library";

import { DIRECTOR_MODEL } from "./config";

export interface MarketingPlan {
  product: ProductInfo;
  direction: MarketingDirection & {
    cameraLabel: string;
    lensLabel: string;
    lookLabel: string;
  };
}

export async function planMarketingAd(url: string): Promise<MarketingPlan> {
  const product = await scrapeProductPage(url);

  const baseUrl = process.env.ARK_BASE_URL;
  const client = createModelArkClient({
    apiKey: process.env.ARK_API_KEY || "",
    ...(baseUrl ? { baseUrl } : {}),
  });

  const direction = await proposeCreativeDirection(client, product, { model: DIRECTOR_MODEL });

  return {
    product,
    direction: {
      ...direction,
      cameraLabel: getCameraPreset(direction.cameraPreset).label,
      lensLabel: getLensPreset(direction.lensPreset).label,
      lookLabel: getLookPreset(direction.lookPreset).label,
    },
  };
}
