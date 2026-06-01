import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { AssetService } from "@/lib/services/assets";

export const runtime = "nodejs";
export const maxDuration = 60;

const ALLOWED_STATUSES = new Set(["Active", "Processing", "Failed"]);

function getErrorStatus(error) {
  if (error.message === "Asset not found.") return 404;
  if (
    error.message.includes("required") ||
    error.message.includes("Unsupported") ||
    error.message.includes("outside the supported")
  ) {
    return 400;
  }
  return 500;
}

export async function GET(req) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;

    if (status && !ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: "Invalid asset status." }, { status: 400 });
    }

    const result = await AssetService.listAssets({
      userId: session.user.id,
      page: searchParams.get("page"),
      pageSize: searchParams.get("pageSize"),
      status,
      refreshProcessing: searchParams.get("refresh") === "true",
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("[ASSETS_GET_ERROR]", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch assets." },
      { status: 500 },
    );
  }
}

export async function POST(req) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const asset = await AssetService.createAsset({
      userId: session.user.id,
      file: formData.get("file"),
      name: formData.get("name"),
    });

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    console.error("[ASSETS_POST_ERROR]", error);
    return NextResponse.json(
      { error: error.message || "Failed to create asset." },
      { status: getErrorStatus(error) },
    );
  }
}

export async function DELETE(req) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "Asset id is required." }, { status: 400 });
    }

    await AssetService.deleteAsset({ userId: session.user.id, id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ASSETS_DELETE_ERROR]", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete asset." },
      { status: getErrorStatus(error) },
    );
  }
}
