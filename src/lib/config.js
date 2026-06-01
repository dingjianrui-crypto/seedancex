/**
 * Centralized configuration for the SaaS template.
 * All environment variables are validated and exported from here.
 */

const config = {
  auth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    },
    secret: process.env.NEXTAUTH_SECRET,
    url: process.env.NEXTAUTH_URL || "http://localhost:3000",
    webhook_url: process.env.WEBHOOK_URL || process.env.NEXTAUTH_URL || "http://localhost:3000",
  },
  stripe: {
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    plans: {
      default: {
        amount: 50, // 50 credits
        price: 500, // $5.00
        currency: "usd",
      }
    }
  },
  ai: {
    seedance: {
      apiKey: process.env.ARK_API_KEY || process.env.SEEDANCE_V2_API_KEY,
      endpoint: process.env.SEEDANCE_ENDPOINT,
      models: {
        "seedance-2.0": process.env.SEEDANCE_MODEL || "dreamina-seedance-2-0-260128",
        "seedance-2.0-fast":
          process.env.SEEDANCE_FAST_MODEL || "dreamina-seedance-2-0-fast-260128",
      },
    }
  },
  storage: {
    vercelBlobReadWriteToken: process.env.BLOB_READ_WRITE_TOKEN,
  },
  assets: {
    accessKeyId: process.env.VOLCENGINE_ACCESS_KEY_ID,
    secretAccessKey: process.env.VOLCENGINE_SECRET_ACCESS_KEY,
    groupId: process.env.VOLCENGINE_ASSET_GROUP_ID,
    projectName: process.env.VOLCENGINE_PROJECT_NAME || "default",
    host:
      process.env.VOLCENGINE_ASSET_HOST ||
      "ark.cn-beijing.volcengineapi.com",
    region: process.env.VOLCENGINE_ASSET_REGION || "cn-beijing",
    service: "ark",
    version: "2024-01-01",
    reconcileSecret: process.env.ASSET_RECONCILE_SECRET,
  },
  db: {
    url: process.env.DATABASE_URL,
  }
};

// Simple validation to warn if critical keys are missing
const requiredKeys = [
  ["GOOGLE_CLIENT_ID", config.auth.google.clientId],
  ["GOOGLE_CLIENT_SECRET", config.auth.google.clientSecret],
  ["STRIPE_SECRET_KEY", config.stripe.secretKey],
  ["DATABASE_URL", config.db.url],
  ["SEEDANCE_ENDPOINT", config.ai.seedance.endpoint],
  ["BLOB_READ_WRITE_TOKEN", config.storage.vercelBlobReadWriteToken],
  ["VOLCENGINE_ACCESS_KEY_ID", config.assets.accessKeyId],
  ["VOLCENGINE_SECRET_ACCESS_KEY", config.assets.secretAccessKey],
  ["VOLCENGINE_ASSET_GROUP_ID", config.assets.groupId],
];

if (typeof window === "undefined") {
  requiredKeys.forEach(([name, value]) => {
    if (!value) {
      console.warn(`[CONFIG] Warning: Missing critical environment variable: ${name}`);
    }
  });
}

export default config;
