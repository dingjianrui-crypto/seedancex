const CREDITS_PER_DOLLAR = 2000;
const TOKENS_PER_MILLION = 1_000_000;
const FRAME_RATE = 24;

export const DEFAULT_CREDIT_PROFIT_FACTOR = 1.2;

const OUTPUT_DIMENSIONS = {
  "480p": {
    "16:9": [864, 496],
    "4:3": [752, 560],
    "1:1": [640, 640],
    "3:4": [560, 752],
    "9:16": [496, 864],
    "21:9": [992, 432],
  },
  "720p": {
    "16:9": [1280, 720],
    "4:3": [1112, 834],
    "1:1": [960, 960],
    "3:4": [834, 1112],
    "9:16": [720, 1280],
    "21:9": [1470, 630],
  },
  "1080p": {
    "16:9": [1920, 1080],
    "4:3": [1664, 1248],
    "1:1": [1440, 1440],
    "3:4": [1248, 1664],
    "9:16": [1080, 1920],
    "21:9": [2206, 946],
  },
};

const PRICE_PER_MILLION_TOKENS = {
  "seedance-2.0": {
    default: {
      "480p": 7,
      "720p": 7,
      "1080p": 7.7,
    },
    withVideoInput: {
      "480p": 4.3,
      "720p": 4.3,
      "1080p": 4.7,
    },
  },
  "seedance-2.0-fast": {
    default: {
      "480p": 5.6,
      "720p": 5.6,
    },
    withVideoInput: {
      "480p": 3.3,
      "720p": 3.3,
    },
  },
};

export function getEstimatedVideoTokens({ duration, resolution, aspectRatio }) {
  const dimensions = OUTPUT_DIMENSIONS[resolution]?.[aspectRatio];

  if (!dimensions) {
    throw new Error("Unsupported resolution or aspect ratio");
  }

  const [width, height] = dimensions;
  return Math.ceil((duration * width * height * FRAME_RATE) / 1024);
}

export function getSeedanceCreditCost({
  totalTokens,
  model,
  resolution,
  hasVideoInput,
  profitFactor = DEFAULT_CREDIT_PROFIT_FACTOR,
}) {
  const pricing = PRICE_PER_MILLION_TOKENS[model];
  const pricePerMillionTokens =
    pricing?.[hasVideoInput ? "withVideoInput" : "default"]?.[resolution];

  if (!pricePerMillionTokens) {
    throw new Error("Unsupported Seedance pricing configuration");
  }
  if (!Number.isFinite(profitFactor) || profitFactor <= 0) {
    throw new Error("Credit profit factor must be a positive number");
  }

  return Math.ceil(
    (totalTokens *
      pricePerMillionTokens *
      CREDITS_PER_DOLLAR *
      profitFactor) /
      TOKENS_PER_MILLION
  );
}

export function getEstimatedSeedanceCreditCost({
  duration,
  resolution,
  aspectRatio,
  model,
  hasVideoInput,
  profitFactor = DEFAULT_CREDIT_PROFIT_FACTOR,
}) {
  const totalTokens = getEstimatedVideoTokens({
    duration,
    resolution,
    aspectRatio,
  });

  return getSeedanceCreditCost({
    totalTokens,
    model,
    resolution,
    hasVideoInput,
    profitFactor,
  });
}
