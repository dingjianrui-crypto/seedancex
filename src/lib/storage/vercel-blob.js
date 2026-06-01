import { put } from "@vercel/blob";
import config from "@/lib/config";

export const vercelBlobStorage = {
  async upload({ pathname, body, contentType, multipart = false }) {
    const options = {
      access: "public",
      addRandomSuffix: true,
      contentType,
      multipart,
    };

    if (config.storage.vercelBlobReadWriteToken) {
      options.token = config.storage.vercelBlobReadWriteToken;
    }

    return put(pathname, body, options);
  },
};
