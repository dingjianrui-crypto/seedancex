import "server-only";

import { prisma } from "@/lib/prisma";
import {
  hasPremiumAssetsAccess,
  PREMIUM_ASSETS_ACCESS_ERROR,
} from "@/lib/premium-assets";
import { normalizeCreditTierId } from "@/lib/server/billing-tiers";

export { PREMIUM_ASSETS_ACCESS_ERROR };

export async function assertPremiumAssetsAccess(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { creditTier: true },
  });

  if (
    !user ||
    !hasPremiumAssetsAccess(normalizeCreditTierId(user.creditTier))
  ) {
    throw new Error(PREMIUM_ASSETS_ACCESS_ERROR);
  }
}
