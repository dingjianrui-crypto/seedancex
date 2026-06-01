import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { StorageService } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return new NextResponse("No file provided", { status: 400 });
    }

    const blob = await StorageService.uploadUserFile({
      userId: session.user.id,
      file,
    });

    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: blob.contentType,
      size: file.size,
    });
  } catch (error) {
    console.error("[UPLOAD_ERROR]", error);
    return new NextResponse(error.message || "Internal Error", { status: 500 });
  }
}
