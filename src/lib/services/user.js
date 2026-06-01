import { prisma } from "@/lib/prisma";

/**
 * Service to manage User data and Credits.
 */
export const UserService = {
  /**
   * Get user credits by ID
   */
  async getCredits(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { credits: true },
    });
    return user?.credits || 0;
  },

  async getCreditTier(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { creditTier: true },
    });
    return user?.creditTier;
  },

  /**
   * Add credits to a user
   */
  async addCredits(userId, amount) {
    return await prisma.user.update({
      where: { id: userId },
      data: {
        credits: {
          increment: amount,
        },
      },
    });
  },

  /**
   * Deduct credits from a user
   */
  async deductCredits(userId, amount = 1) {
    const result = await prisma.user.updateMany({
      where: {
        id: userId,
        credits: {
          gte: amount,
        },
      },
      data: {
        credits: {
          decrement: amount,
        },
      },
    });

    if (result.count === 0) {
      throw new Error("Insufficient credits");
    }

    return prisma.user.findUnique({
      where: { id: userId },
    });
  },

  /**
   * Find or create user by email (helper for non-OIDC flows if needed)
   */
  async findByEmail(email) {
    return await prisma.user.findUnique({
      where: { email },
    });
  }
};
