import "server-only";

import { DEFAULT_CREDIT_PROFIT_FACTOR } from "@/lib/seedance-pricing";

export function getCreditProfitFactor() {
  const profitFactor = Number(process.env.CREDIT_PROFIT_FACTOR);

  return Number.isFinite(profitFactor) && profitFactor > 0
    ? profitFactor
    : DEFAULT_CREDIT_PROFIT_FACTOR;
}
