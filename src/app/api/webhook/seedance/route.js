import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSeedanceCreditCost } from "@/lib/seedance-pricing";
import { getCreditProfitFactor } from "@/lib/server/credit-pricing";

export const runtime = "nodejs";

function getRequestId(data) {
  return data.id || data.request_id || data.requestId;
}

function getErrorMessage(data) {
  if (typeof data.error === "string" && data.error) return data.error;
  if (data.error?.message) return data.error.message;
  if (["failed", "canceled", "cancelled", "error"].includes(data.status)) {
    return data.message || "Generation failed.";
  }
  if (data.content?.status === "failed") {
    return data.content.message || data.content.error || "Generation failed.";
  }
  return null;
}

function isSucceeded(data) {
  return data.status === "succeeded" || data.status === "completed";
}

function getSourceVideoUrl(data) {
  return data.content?.video_url || data.content?.videoUrl || data.video_url || data.videoUrl;
}

function getTotalTokens(data) {
  const totalTokens = data.usage?.total_tokens;
  return Number.isInteger(totalTokens) && totalTokens >= 0 ? totalTokens : null;
}

async function failCreationAndRefund(creation, error) {
  const refundedAt = new Date();

  return prisma.$transaction(async (tx) => {
    const update = await tx.creation.updateMany({
      where: {
        id: creation.id,
        refundedAt: null,
        status: { not: "completed" },
      },
      data: {
        status: "failed",
        error,
        refundedAt,
      },
    });

    if (update.count > 0 && creation.estimatedCredit > 0) {
      await tx.user.update({
        where: { id: creation.userId },
        data: {
          credits: {
            increment: creation.estimatedCredit,
          },
        },
      });
    }

    return update.count > 0;
  });
}

async function completeCreationAndReconcile(creation, videoUrl, totalTokens) {
  const model =
    creation.quality === "seedance-2.0-fast"
      ? "seedance-2.0-fast"
      : "seedance-2.0";
  const creditCost = getSeedanceCreditCost({
    totalTokens,
    model,
    resolution: creation.resolution,
    hasVideoInput: creation.videoFiles.length > 0,
    profitFactor: getCreditProfitFactor(),
  });

  return prisma.$transaction(async (tx) => {
    const update = await tx.creation.updateMany({
      where: {
        id: creation.id,
        status: "processing",
      },
      data: {
        status: "completed",
        videoUrl,
        totalTokens,
        creditCost,
        error: null,
      },
    });

    if (update.count > 0) {
      await tx.user.update({
        where: { id: creation.userId },
        data: {
          credits: {
            increment: creation.estimatedCredit - creditCost,
          },
        },
      });
    }

    return update.count > 0;
  });
}

export async function POST(req) {
  try {
    const data = await req.json();
    const requestId = getRequestId(data);

    if (!requestId) {
      console.error("[SEEDANCE_WEBHOOK_ERROR] Missing request id in payload", data);
      return NextResponse.json({ error: "Missing request id" }, { status: 400 });
    }

    const creation = await prisma.creation.findUnique({
      where: { requestId },
    });

    if (!creation) {
      console.warn(`[SEEDANCE_WEBHOOK] Creation with requestId ${requestId} not found.`);
      return NextResponse.json({ error: "Creation not found" }, { status: 404 });
    }

    if (creation.status === "completed") {
      return NextResponse.json({ success: true, duplicate: true });
    }

    const errorMessage = getErrorMessage(data);
    if (creation.status === "failed" && !errorMessage) {
      return NextResponse.json({ success: true, duplicate: true });
    }

    if (errorMessage) {
      const refunded = await failCreationAndRefund(creation, errorMessage);
      return NextResponse.json({ success: true, refunded });
    }

    const sourceVideoUrl = getSourceVideoUrl(data);
    if (!isSucceeded(data)) {
      return NextResponse.json({ success: true, status: data.status || "received" });
    }

    if (!sourceVideoUrl) {
      return NextResponse.json(
        { error: "Succeeded Seedance callback did not include content.video_url." },
        { status: 400 }
      );
    }

    const totalTokens = getTotalTokens(data);
    if (totalTokens === null) {
      return NextResponse.json(
        { error: "Succeeded Seedance callback did not include valid usage.total_tokens." },
        { status: 400 }
      );
    }

    const completed = await completeCreationAndReconcile(
      creation,
      sourceVideoUrl,
      totalTokens
    );

    return NextResponse.json({
      success: true,
      duplicate: !completed,
      videoUrl: sourceVideoUrl,
    });
  } catch (error) {
    console.error("[SEEDANCE_WEBHOOK_ERROR]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
