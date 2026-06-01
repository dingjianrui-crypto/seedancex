import { createHash, createHmac } from "crypto";
import config from "@/lib/config";

function hashSha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

function hmacSha256(key, content) {
  return createHmac("sha256", key).update(content).digest();
}

function encodeQueryValue(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function normalizeQuery(params) {
  return Object.keys(params)
    .sort()
    .map((key) => `${encodeQueryValue(key)}=${encodeQueryValue(params[key])}`)
    .join("&");
}

function getApiError(payload, status) {
  const metadataError = payload?.ResponseMetadata?.Error;
  const message =
    metadataError?.Message ||
    payload?.message ||
    payload?.Message ||
    `Volcengine asset API request failed with status ${status}.`;
  const error = new Error(message);
  error.code = metadataError?.Code || payload?.code || "VOLCENGINE_ASSET_API_ERROR";
  return error;
}

function getRequiredConfig() {
  const { accessKeyId, secretAccessKey, host, region, service, version } =
    config.assets;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Volcengine asset API credentials are not configured.");
  }

  return { accessKeyId, secretAccessKey, host, region, service, version };
}

async function requestAssetApi(action, body) {
  const { accessKeyId, secretAccessKey, host, region, service, version } =
    getRequiredConfig();
  const payload = JSON.stringify(body);
  const query = normalizeQuery({ Action: action, Version: version });
  const date = new Date();
  const xDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const shortDate = xDate.slice(0, 8);
  const contentHash = hashSha256(payload);
  const signedHeaders = "content-type;host;x-content-sha256;x-date";
  const canonicalRequest = [
    "POST",
    "/",
    query,
    [
      "content-type:application/json",
      `host:${host}`,
      `x-content-sha256:${contentHash}`,
      `x-date:${xDate}`,
    ].join("\n"),
    "",
    signedHeaders,
    contentHash,
  ].join("\n");
  const scope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    xDate,
    scope,
    hashSha256(canonicalRequest),
  ].join("\n");
  const dateKey = hmacSha256(Buffer.from(secretAccessKey, "utf8"), shortDate);
  const regionKey = hmacSha256(dateKey, region);
  const serviceKey = hmacSha256(regionKey, service);
  const signingKey = hmacSha256(serviceKey, "request");
  const signature = hmacSha256(signingKey, stringToSign).toString("hex");

  const response = await fetch(`https://${host}/?${query}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Content-Sha256": contentHash,
      "X-Date": xDate,
      Authorization:
        `HMAC-SHA256 Credential=${accessKeyId}/${scope}, ` +
        `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: payload,
    cache: "no-store",
  });
  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`Volcengine asset API returned invalid JSON (${response.status}).`);
  }

  if (!response.ok || data?.ResponseMetadata?.Error) {
    throw getApiError(data, response.status);
  }

  return data.Result || {};
}

export const VolcengineAssetApi = {
  createAsset({ groupId, url, name, assetType, projectName }) {
    return requestAssetApi("CreateAsset", {
      GroupId: groupId,
      URL: url,
      Name: name,
      AssetType: assetType,
      ProjectName: projectName,
    });
  },

  getAsset({ id, projectName }) {
    return requestAssetApi("GetAsset", {
      Id: id,
      ProjectName: projectName,
    });
  },

  deleteAsset({ id, projectName }) {
    return requestAssetApi("DeleteAsset", {
      Id: id,
      ProjectName: projectName,
    });
  },
};
