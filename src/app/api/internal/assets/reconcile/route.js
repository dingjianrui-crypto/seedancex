import { NextResponse } from "next/server";
import config from "@/lib/config";
import { AssetService } from "@/lib/services/assets";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  const secret = config.assets.reconcileSecret;
  const authorization = req.headers.get("authorization");

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await AssetService.reconcileProcessingAssets();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[ASSETS_RECONCILE_ERROR]", error);
    return NextResponse.json(
      { error: error.message || "Failed to reconcile assets." },
      { status: 500 },
    );
  }
}
