import config from "@/lib/config";
import { UserService } from "./user";
import { prisma } from "@/lib/prisma";
import { AssetService } from "./assets";
import {
  DEFAULT_CREDIT_TIER_ID,
  getCreditTier,
} from "@/lib/server/billing-tiers";
import { getEstimatedSeedanceCreditCost } from "@/lib/seedance-pricing";

/**
 * Service to manage AI generations and interactions.
 */
/**
 * Service to manage AI generations and interactions.
 */
export const AIService = {
  aspectRatios: new Set(["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"]),
  resolutions: new Set(["480p", "720p", "1080p"]),
  generationModes: new Set([
    "text-to-video",
    "image-to-video",
    "reference-to-video",
  ]),

  buildContent({ prompt, mode, images_list = [], video_files = [], audio_files = [] }) {
    const content = [];

    if (prompt) {
      content.push({
        type: "text",
        text: prompt,
      });
    }

    images_list.slice(0, 9).forEach((url, index) => {
      content.push({
        type: "image_url",
        image_url: { url },
        role:
          mode === "image-to-video"
            ? index === 0
              ? "first_frame"
              : "last_frame"
            : "reference_image",
      });
    });

    video_files.slice(0, 3).forEach((url) => {
      content.push({
        type: "video_url",
        video_url: { url },
        role: "reference_video",
      });
    });

    audio_files.slice(0, 3).forEach((url) => {
      content.push({
        type: "audio_url",
        audio_url: { url },
        role: "reference_audio",
      });
    });

    return content;
  },

  async generate(userId, { mode, prompt, aspect_ratio = "16:9", resolution = "720p", duration = 5, model, seed = -1, camera_fixed = false, generate_audio = true, images_list = [], video_files = [], audio_files = [] }) {
    const durationSeconds = parseInt(duration);
    const seedValue =
      typeof seed === "string" && seed.trim() === "" ? NaN : Number(seed);
    const modelKey = model || "seedance-2.0";
    const generationMode = mode || "reference-to-video";

    if (!this.aspectRatios.has(aspect_ratio)) {
      throw new Error("Unsupported aspect ratio");
    }
    if (!this.resolutions.has(resolution)) {
      throw new Error("Unsupported resolution");
    }
    if (!this.generationModes.has(generationMode)) {
      throw new Error("Unsupported generation mode");
    }
    if (!Number.isInteger(seedValue)) {
      throw new Error("Seed must be an integer");
    }
    if (typeof camera_fixed !== "boolean") {
      throw new Error("Camera fixed must be a boolean");
    }
    if (typeof generate_audio !== "boolean") {
      throw new Error("Generate audio must be a boolean");
    }
    if (
      generationMode === "image-to-video" &&
      (images_list.length < 1 || images_list.length > 2)
    ) {
      throw new Error("Image to Video requires one or two images");
    }
    if (!Number.isInteger(durationSeconds) || durationSeconds < 4 || durationSeconds > 15) {
      throw new Error("Duration must be between 4 and 15 seconds");
    }
    if (!config.ai.seedance.models[modelKey]) {
      throw new Error("Unsupported Seedance model");
    }
    if (modelKey === "seedance-2.0-fast" && resolution === "1080p") {
      throw new Error("1080p is not supported by seedance-2.0-fast");
    }
    const userCreditTier = await UserService.getCreditTier(userId);
    const creditTier =
      getCreditTier(userCreditTier) || getCreditTier(DEFAULT_CREDIT_TIER_ID);
    if (resolution === "1080p" && !creditTier.supports1080p) {
      throw new Error("1080p requires a standard or premium credit tier");
    }

    const apiKey = config.ai.seedance.apiKey;
    if (!apiKey) throw new Error("SEEDANCE_V2_API_KEY is not configured");
    const endpoint = config.ai.seedance.endpoint;
    if (!endpoint) throw new Error("SEEDANCE_ENDPOINT is not configured");
    const seedanceModel = config.ai.seedance.models[modelKey];
    const selectedImages =
      generationMode === "text-to-video"
        ? []
        : images_list.slice(0, generationMode === "image-to-video" ? 2 : 9);
    const selectedVideos =
      generationMode === "reference-to-video" ? video_files.slice(0, 3) : [];
    const selectedAudio =
      generationMode === "reference-to-video" ? audio_files.slice(0, 3) : [];
    const estimatedCredit = getEstimatedSeedanceCreditCost({
      duration: durationSeconds,
      resolution,
      aspectRatio: aspect_ratio,
      model: modelKey,
      hasVideoInput: selectedVideos.length > 0,
    });
    const [images, videos, audio] = await Promise.all([
      AssetService.resolveGenerationReferences({
        userId,
        references: selectedImages,
        expectedType: "Image",
      }),
      AssetService.resolveGenerationReferences({
        userId,
        references: selectedVideos,
        expectedType: "Video",
      }),
      AssetService.resolveGenerationReferences({
        userId,
        references: selectedAudio,
        expectedType: "Audio",
      }),
    ]);

    const webhookUrl = `${config.auth.webhook_url}/api/webhook/seedance`;
    const submitUrl = new URL(endpoint);

    await UserService.deductCredits(userId, estimatedCredit);
    const priority = creditTier.priority;

    const payload = {
      model: seedanceModel,
      content: this.buildContent({
        prompt,
        mode: generationMode,
        images_list: images.map((reference) => reference.generationUrl),
        video_files: videos.map((reference) => reference.generationUrl),
        audio_files: audio.map((reference) => reference.generationUrl),
      }),
      resolution,
      generate_audio,
      ratio: aspect_ratio,
      duration: durationSeconds,
      seed: seedValue,
      watermark: false,
      camera_fixed,
      priority,
      callback_url: webhookUrl,
    };

    let request_id;
    try {
      const submitRes = await fetch(submitUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!submitRes.ok) {
        const errorText = await submitRes.text();
        throw new Error(`API Submission Failed: ${submitRes.status} ${errorText}`);
      }

      const submitData = await submitRes.json();
      request_id = submitData.id || submitData.request_id;
      if (!request_id) throw new Error("No task id received from API");
    } catch (error) {
      await UserService.addCredits(userId, estimatedCredit);
      throw error;
    }

    const creationModel = prisma.creation || prisma.Creation;
    try {
      if (creationModel) {
        await creationModel.create({
          data: {
            userId,
            prompt,
            aspectRatio: aspect_ratio,
            resolution,
            duration: durationSeconds,
            quality: modelKey,
            videoFiles: videos.map((reference) => reference.previewUrl),
            audioFiles: audio.map((reference) => reference.previewUrl),
            inputImages: images.map((reference) => reference.previewUrl),
            requestId: request_id,
            status: "processing",
            estimatedCredit,
            creditTierSnapshot: creditTier.id,
            prioritySnapshot: priority,
          }
        });
      }
    } catch (error) {
      await UserService.addCredits(userId, estimatedCredit);
      throw error;
    }

    return { request_id };
  },

  async edit(userId, params) {
    return this.generate(userId, params);
  },

  /**
   * Check status of a request and save to DB on completion
   */
  async checkStatus(requestId, userId, metadata) {
    const creationModel = prisma.creation || prisma.Creation;
    if (!creationModel) return { status: "processing" };

    const creation = await creationModel.findUnique({
      where: { requestId }
    });

    if (!creation) {
      return { status: "processing" };
    }

    if (creation.status === "completed") {
      return { status: "completed", videoUrl: creation.videoUrl };
    }

    if (creation.status === "failed") {
      return { status: "failed", error: creation.error || "Generation failed." };
    }

    return { status: "processing" };
  }
};
