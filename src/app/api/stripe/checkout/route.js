import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { getPurchasableCreditTier } from "@/lib/server/billing-tiers";
import { BillingService } from "@/lib/services/billing";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { tierId } = await req.json();

    if (!getPurchasableCreditTier(tierId)) {
      return NextResponse.json({ error: "Invalid credit tier" }, { status: 400 });
    }

    const checkoutUrl = await BillingService.createCheckoutSession(
      session.user.id,
      tierId
    );

    return NextResponse.json({ url: checkoutUrl });
  } catch (error) {
    console.error("[STRIPE_CHECKOUT]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}
