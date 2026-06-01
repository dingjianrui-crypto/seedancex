import { vercelBlobStorage } from "./vercel-blob";
import { randomUUID } from "crypto";

const storageProvider = vercelBlobStorage;

function safePathSegment(value, fallback = "file") {
  const safe = String(value || fallback)
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return safe || fallback;
}

function buildPath(prefix, filename) {
  const id = randomUUID();

  const safePrefix = String(prefix || "uploads")
    .split("/")
    .map((segment) => safePathSegment(segment, "item"))
    .join("/");

  return `${safePrefix}/${Date.now()}-${id}-${safePathSegment(filename)}`;
}

export const StorageService = {
  async uploadUserFile({ userId, file }) {
    const pathname = buildPath(`uploads/${userId}`, file.name);

    return storageProvider.upload({
      pathname,
      body: file,
      contentType: file.type || "application/octet-stream",
      multipart: true,
    });
  },

  async uploadGeneratedVideo({ creationId, body, contentType = "video/mp4" }) {
    return storageProvider.upload({
      pathname: `generations/${safePathSegment(creationId)}/result.mp4`,
      body,
      contentType,
      multipart: true,
    });
  },
};
