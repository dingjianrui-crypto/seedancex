const PREMIUM_TIER_IDS = new Set(["premium", "quantum-flow"]);

export const PREMIUM_ASSETS_ACCESS_ERROR =
  "Managed assets require an active premium credit tier.";

export function hasPremiumAssetsAccess(creditTier) {
  return PREMIUM_TIER_IDS.has(creditTier);
}
