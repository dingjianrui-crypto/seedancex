import { prisma } from "@/lib/prisma";
import config from "@/lib/config";
import { StorageService } from "@/lib/storage";
import { VolcengineAssetApi } from "./volcengine-assets";
import { assertPremiumAssetsAccess } from "@/lib/server/premium-assets";

const STATUS_PROCESSING = "Processing";
const STATUS_ACTIVE = "Active";
const STATUS_FAILED = "Failed";
const PAGE_SIZE_DEFAULT = 12;
const PAGE_SIZE_MAX = 100;

const FILE_RULES = {
  Image: {
    extensions: new Set(["jpeg", "jpg", "png", "webp", "bmp", "tiff", "gif", "heic", "heif"]),
    maxBytes: 30 * 1024 * 1024,
  },
  Video: {
    extensions: new Set(["mp4", "mov"]),
    maxBytes: 50 * 1024 * 1024,
  },
  Audio: {
    extensions: new Set(["wav", "mp3"]),
    maxBytes: 15 * 1024 * 1024,
  },
};

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function parseRemoteDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeName(value, fallback) {
  const name = String(value || fallback || "").trim();
  if (!name) throw new Error("Asset name is required.");
  return name.slice(0, 64);
}

function getExtension(filename) {
  return String(filename || "").toLowerCase().split(".").pop();
}

function inferAssetType(file) {
  const extension = getExtension(file.name);

  return Object.entries(FILE_RULES).find(([, rule]) =>
    rule.extensions.has(extension),
  )?.[0];
}

function validateUpload(file) {
  if (!file || typeof file.name !== "string" || typeof file.size !== "number") {
    throw new Error("A file is required.");
  }

  const type = inferAssetType(file);
  if (!type) {
    throw new Error("Unsupported asset format.");
  }

  if (file.size <= 0 || file.size > FILE_RULES[type].maxBytes) {
    throw new Error(`${type} file size is outside the supported limit.`);
  }

  return type;
}

function getSharedAssetConfig() {
  const { groupId, projectName } = config.assets;
  if (!groupId) {
    throw new Error("VOLCENGINE_ASSET_GROUP_ID is not configured.");
  }
  return { groupId, projectName };
}

function toAssetDto(asset) {
  return {
    id: asset.id,
    name: asset.name,
    type: asset.type,
    previewUrl: asset.sourceBlobUrl,
    status: asset.status,
    errorCode: asset.errorCode,
    errorMessage: asset.errorMessage,
    lastCheckedAt: asset.lastCheckedAt,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
  };
}

async function syncAsset(asset) {
  if (!asset || asset.deletedAt || asset.status !== STATUS_PROCESSING) {
    return asset;
  }

  const result = await VolcengineAssetApi.getAsset({
    id: asset.remoteAssetId,
    projectName: asset.projectNameSnapshot,
  });
  const status = [STATUS_ACTIVE, STATUS_PROCESSING, STATUS_FAILED].includes(
    result.Status,
  )
    ? result.Status
    : STATUS_PROCESSING;

  return prisma.asset.update({
    where: { id: asset.id },
    data: {
      status,
      errorCode: result.Error?.Code || null,
      errorMessage: result.Error?.Message || null,
      lastCheckedAt: new Date(),
      remoteCreatedAt: parseRemoteDate(result.CreateTime),
      remoteUpdatedAt: parseRemoteDate(result.UpdateTime),
    },
  });
}

function normalizeReference(reference) {
  if (typeof reference === "string") {
    if (reference.startsWith("asset://")) {
      throw new Error("Managed assets must be selected from My Assets.");
    }

    let url;
    try {
      url = new URL(reference);
    } catch {
      throw new Error("Reference URL is invalid.");
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Reference URLs must use HTTP or HTTPS.");
    }

    return { source: "url", url: reference };
  }

  if (reference?.assetId && typeof reference.assetId === "string") {
    return { source: "asset", assetId: reference.assetId };
  }

  throw new Error("Invalid generation reference.");
}

export const AssetService = {
  async createAsset({ userId, file, name }) {
    const type = validateUpload(file);
    const { groupId, projectName } = getSharedAssetConfig();
    const assetName = normalizeName(name, file.name);
    const blob = await StorageService.uploadUserFile({ userId, file });
    const result = await VolcengineAssetApi.createAsset({
      groupId,
      projectName,
      url: blob.url,
      name: assetName,
      assetType: type,
    });

    if (!result.Id) {
      throw new Error("Volcengine CreateAsset did not return an asset ID.");
    }

    const asset = await prisma.asset.create({
      data: {
        remoteAssetId: result.Id,
        userId,
        name: assetName,
        type,
        sourceBlobUrl: blob.url,
        sourceBlobPathname: blob.pathname,
        status: STATUS_PROCESSING,
        groupIdSnapshot: groupId,
        projectNameSnapshot: projectName,
      },
    });

    return toAssetDto(asset);
  },

  async listAssets({ userId, page, pageSize, status, refreshProcessing = false }) {
    const normalizedPage = clampInteger(page, 1, 1, Number.MAX_SAFE_INTEGER);
    const normalizedPageSize = clampInteger(
      pageSize,
      PAGE_SIZE_DEFAULT,
      1,
      PAGE_SIZE_MAX,
    );
    const where = {
      userId,
      deletedAt: null,
      ...(status ? { status } : {}),
    };
    let [assets, totalCount] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (normalizedPage - 1) * normalizedPageSize,
        take: normalizedPageSize,
      }),
      prisma.asset.count({ where }),
    ]);

    if (refreshProcessing) {
      await Promise.allSettled(
        assets.filter((asset) => asset.status === STATUS_PROCESSING).map(syncAsset),
      );
      assets = await prisma.asset.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (normalizedPage - 1) * normalizedPageSize,
        take: normalizedPageSize,
      });
    }

    return {
      items: assets.map(toAssetDto),
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / normalizedPageSize)),
    };
  },

  async deleteAsset({ userId, id }) {
    const asset = await prisma.asset.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!asset) {
      throw new Error("Asset not found.");
    }

    await VolcengineAssetApi.deleteAsset({
      id: asset.remoteAssetId,
      projectName: asset.projectNameSnapshot,
    });
    await prisma.asset.update({
      where: { id: asset.id },
      data: { deletedAt: new Date() },
    });
  },

  async reconcileProcessingAssets({ userId, limit = 50 } = {}) {
    const assets = await prisma.asset.findMany({
      where: {
        ...(userId ? { userId } : {}),
        deletedAt: null,
        status: STATUS_PROCESSING,
      },
      orderBy: { lastCheckedAt: { sort: "asc", nulls: "first" } },
      take: clampInteger(limit, 50, 1, 100),
    });
    const results = await Promise.allSettled(assets.map(syncAsset));

    return {
      checked: results.length,
      failed: results.filter((result) => result.status === "rejected").length,
    };
  },

  async resolveGenerationReferences({ userId, references = [], expectedType }) {
    const normalized = references.map(normalizeReference);
    const assetIds = [
      ...new Set(
        normalized
          .filter((reference) => reference.source === "asset")
          .map((reference) => reference.assetId),
      ),
    ];
    if (assetIds.length) {
      await assertPremiumAssetsAccess(userId);
    }
    const assets = assetIds.length
      ? await prisma.asset.findMany({
          where: {
            id: { in: assetIds },
            userId,
            deletedAt: null,
            status: STATUS_ACTIVE,
          },
        })
      : [];
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));

    return normalized.map((reference) => {
      if (reference.source === "url") {
        return { generationUrl: reference.url, previewUrl: reference.url };
      }

      const asset = assetsById.get(reference.assetId);
      if (!asset) {
        throw new Error("A selected managed asset is unavailable or still processing.");
      }
      if (expectedType && asset.type !== expectedType) {
        throw new Error(
          `A selected managed asset is not a valid ${expectedType.toLowerCase()} reference.`,
        );
      }

      return {
        generationUrl: `asset://${asset.remoteAssetId}`,
        previewUrl: asset.sourceBlobUrl,
      };
    });
  },
};
