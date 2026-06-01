import "server-only";

export const DEFAULT_CREDIT_TIER_ID = "basic";

const CREDIT_TIERS = {
  basic: {
    id: "basic",
    credits: 40000,
    amount: 2000,
    currency: "usd",
    priority: 0,
    supports1080p: false,
  },
  standard: {
    id: "standard",
    credits: 100000,
    amount: 5000,
    currency: "usd",
    priority: 1,
    supports1080p: true,
  },
  premium: {
    id: "premium",
    credits: 200000,
    amount: 10000,
    currency: "usd",
    priority: 2,
    supports1080p: true,
  },
};

const LEGACY_TIER_IDS = {
  "starter-manifest": "basic",
  "power-engine": "standard",
  "quantum-flow": "premium",
};

export function normalizeCreditTierId(tierId) {
  return LEGACY_TIER_IDS[tierId] || tierId;
}

export function getCreditTier(tierId) {
  return CREDIT_TIERS[normalizeCreditTierId(tierId)];
}

export function getPurchasableCreditTier(tierId) {
  return CREDIT_TIERS[tierId];
}
