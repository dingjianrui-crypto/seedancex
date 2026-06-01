import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { AIService } from "@/lib/services/ai";

export async function POST(req) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { mode, prompt, aspect_ratio, resolution, duration, model, seed, camera_fixed, generate_audio, images_list, video_files, audio_files } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    const result = await AIService.generate(session.user.id, {
      prompt,
      mode,
      aspect_ratio,
      resolution,
      duration,
      model,
      seed,
      camera_fixed,
      generate_audio,
      images_list,
      video_files,
      audio_files,
    });

    return NextResponse.json({
      ...result,
      metadata: { prompt, mode, aspect_ratio, resolution }
    });
  } catch (error) {
    if (error.message === "Insufficient credits") {
      return NextResponse.json({ error: "Insufficient credits" }, { status: 403 });
    }
    if (error.message === "1080p requires a standard or premium credit tier") {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error("[AI_SEEDANCE]", error);
    return NextResponse.json({ error: error.message || "Internal Error" }, { status: 500 });
  }
}
