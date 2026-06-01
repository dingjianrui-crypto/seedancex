import config from "@/lib/config";
import { prisma } from "@/lib/prisma";
import {
  getCreditTier,
  getPurchasableCreditTier,
} from "@/lib/server/billing-tiers";
import { stripe } from "@/lib/stripe";

function getStripeId(value) {
  return typeof value === "string" ? value : value?.id || null;
}

function getPaymentId(session) {
  return session.metadata?.paymentId;
}

/**
 * Service to manage Stripe Payments and Fulfillment.
 */
export const BillingService = {
  /**
   * Create a checkout session for credits.
   */
  async createCheckoutSession(userId, tierId) {
    const tier = getPurchasableCreditTier(tierId);

    if (!tier) {
      throw new Error("Invalid credit tier");
    }

    const payment = await prisma.payment.create({
      data: {
        userId,
        tierId: tier.id,
        amount: tier.amount,
        currency: tier.currency,
        credits: tier.credits,
      },
    });

    let session;

    try {
      session = await stripe.checkout.sessions.create(
        {
          payment_method_types: ["card"],
          line_items: [
            {
              price_data: {
                currency: tier.currency,
                product_data: {
                  name: "Credits Top-up",
                  description: `Purchase ${tier.credits} credits for generative manifestations.`,
                },
                unit_amount: tier.amount,
              },
              quantity: 1,
            },
          ],
          mode: "payment",
          success_url: `${config.auth.url}/?success=true`,
          cancel_url: `${config.auth.url}/pricing?canceled=true`,
          metadata: {
            paymentId: payment.id,
            userId,
            tierId: tier.id,
          },
          payment_intent_data: {
            metadata: {
              paymentId: payment.id,
            },
          },
        },
        {
          idempotencyKey: payment.id,
        }
      );
    } catch (error) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "FAILED",
          failureMessage: error.message,
        },
      });
      throw error;
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: getStripeId(session.payment_intent),
      },
    });

    return session.url;
  },

  /**
   * Handle Stripe webhook events.
   */
  async handleWebhook(body, signature) {
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        config.stripe.webhookSecret
      );
    } catch (error) {
      throw new Error(`Webhook Error: ${error.message}`);
    }

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      const paymentId = getPaymentId(session);

      if (!paymentId || session.payment_status !== "paid") {
        return { success: false };
      }

      return prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
        });

        if (!payment) {
          throw new Error(`Unknown payment: ${paymentId}`);
        }

        const tier = getCreditTier(payment.tierId);

        if (!tier) {
          throw new Error(`Unknown credit tier: ${payment.tierId}`);
        }

        if (
          payment.stripeCheckoutSessionId &&
          payment.stripeCheckoutSessionId !== session.id
        ) {
          throw new Error(`Checkout session mismatch for payment: ${paymentId}`);
        }

        if (
          payment.amount !== session.amount_total ||
          payment.currency !== session.currency
        ) {
          throw new Error(`Checkout amount mismatch for payment: ${paymentId}`);
        }

        if (payment.status === "PAID") {
          return { success: true, duplicate: true, paymentId };
        }

        const update = await tx.payment.updateMany({
          where: {
            id: paymentId,
            status: {
              in: ["PENDING", "PAYMENT_FAILED"],
            },
          },
          data: {
            status: "PAID",
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: getStripeId(session.payment_intent),
            stripeCompletedEventId: event.id,
            failureMessage: null,
            paidAt: new Date(),
          },
        });

        if (update.count === 0) {
          const currentPayment = await tx.payment.findUnique({
            where: { id: paymentId },
          });

          if (currentPayment?.status === "PAID") {
            return { success: true, duplicate: true, paymentId };
          }

          throw new Error(`Payment cannot be fulfilled from status: ${payment.status}`);
        }

        await tx.user.update({
          where: { id: payment.userId },
          data: {
            credits: {
              increment: payment.credits,
            },
            creditTier: tier.id,
          },
        });

        return {
          success: true,
          paymentId,
          userId: payment.userId,
          credits: payment.credits,
        };
      });
    }

    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object;
      const paymentId = paymentIntent.metadata?.paymentId;

      if (paymentId) {
        await prisma.payment.updateMany({
          where: {
            id: paymentId,
            status: {
              not: "PAID",
            },
          },
          data: {
            status: "PAYMENT_FAILED",
            stripePaymentIntentId: paymentIntent.id,
            failureMessage:
              paymentIntent.last_payment_error?.message || "Payment failed",
          },
        });
      }
    }

    if (event.type === "checkout.session.expired") {
      const paymentId = getPaymentId(event.data.object);

      if (paymentId) {
        await prisma.payment.updateMany({
          where: {
            id: paymentId,
            status: {
              in: ["PENDING", "PAYMENT_FAILED"],
            },
          },
          data: {
            status: "EXPIRED",
          },
        });
      }
    }

    return { success: false };
  },
};
