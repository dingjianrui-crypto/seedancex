import { NextResponse } from "next/server";
import { getCreditProfitFactor } from "@/lib/server/credit-pricing";

export function GET() {
  return NextResponse.json(
    { creditProfitFactor: getCreditProfitFactor() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
