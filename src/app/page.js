"use client";

import { useSession, signIn } from "next-auth/react";
import Image from "next/image";
import { useState, useRef, useEffect } from "react";
import {
  FaBolt,
  FaMagic,
  FaChevronDown,
  FaTrash,
  FaSyncAlt,
  FaVideo,
  FaMusic,
  FaFolderOpen,
} from "react-icons/fa";
import { IoImageOutline } from "react-icons/io5";
import { FiDownload } from "react-icons/fi";
import { motion, AnimatePresence } from "framer-motion";
import { downloadMedia } from "@/lib/utils";
import { ManagedAssetPicker } from "@/components/saas/ManagedAssetPicker";
import {
  DEFAULT_CREDIT_PROFIT_FACTOR,
  getEstimatedSeedanceCreditCost,
} from "@/lib/seedance-pricing";
import { hasPremiumAssetsAccess } from "@/lib/premium-assets";

const ASPECT_RATIOS = [
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "3:4", value: "3:4" },
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" },
  { label: "21:9", value: "21:9" },
];

const RESOLUTIONS = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p" },
  { value: "1080p", label: "1080p" },
];

const DURATIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 4,
  label: `${i + 4} Seconds`,
}));

const MODELS = [
  { value: "seedance-2.0", label: "seedance-2.0" },
  { value: "seedance-2.0-fast", label: "seedance-2.0-fast" },
];
const IMAGE_TO_VIDEO_MAX_IMAGES = 2;

function CustomSelect({ label, value, options, onChange, icon: Icon }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target))
        setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value) || options[0];

  return (
    <div className="space-y-1.5" ref={containerRef}>
      <label className="text-[10px] font-medium text-muted uppercase tracking-wider">
        {label}
      </label>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 bg-glass-bg border border-glass-border rounded-md text-xs font-medium text-foreground hover:bg-glass-hover transition-colors outline-none"
        >
          <div className="flex items-center gap-2">
            {Icon && <Icon className="text-primary-500 text-[10px]" />}
            {selectedOption.label}
          </div>
          <FaChevronDown
            className={`text-[10px] text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="absolute bottom-10 left-0 right-0 bg-glass-bg border border-glass-border rounded-md shadow-xl z-[100] overflow-hidden backdrop-blur-xl"
            >
              {options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2.5 text-xs transition-colors ${
                    value === option.value
                      ? "bg-primary-500 text-white"
                      : "text-muted hover:bg-glass-hover hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export default function Home() {
  const { data: session } = useSession();

  // Mode State
  const [mode, setMode] = useState("text-to-video");

  // Form State
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [resolution, setResolution] = useState(RESOLUTIONS[1].value); // 720p default
  const [duration, setDuration] = useState(5);
  const [model, setModel] = useState(MODELS[0].value);
  const [seed, setSeed] = useState("-1");
  const [cameraFixed, setCameraFixed] = useState(false);
  const [generateAudio, setGenerateAudio] = useState(true);
  const [creditProfitFactor, setCreditProfitFactor] = useState(
    DEFAULT_CREDIT_PROFIT_FACTOR,
  );
  const creditTier = session?.user?.creditTier || "basic";
  const hasAssetsAccess = hasPremiumAssetsAccess(creditTier);
  const canSelect1080p =
    creditTier !== "basic" && model !== "seedance-2.0-fast";
  const effectiveResolution =
    resolution === "1080p" && !canSelect1080p ? "720p" : resolution;
  const [imagesList, setImagesList] = useState([]); // Max 9 URLs for I2V/Reference
  const [videoFiles, setVideoFiles] = useState([]); // Max 3 URLs for Reference
  const [audioFiles, setAudioFiles] = useState([]); // Max 3 URLs for Reference
  const [referenceItems, setReferenceItems] = useState([]);
  const [assetPickerType, setAssetPickerType] = useState(null);

  // UI State
  const [isUploading, setIsUploading] = useState(false);
  const [isUploadingReference, setIsUploadingReference] = useState(false);
  const fileInputRef = useRef(null);
  const referenceInputRef = useRef(null);
  const promptInputRef = useRef(null);
  const referenceOrderRef = useRef(0);
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);
  const [referenceTriggerIndex, setReferenceTriggerIndex] = useState(null);
  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [resultUrl, setResultUrl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchPricingConfig() {
      try {
        const response = await fetch("/api/pricing-config", {
          signal: controller.signal,
        });
        const data = await response.json();

        if (
          response.ok &&
          Number.isFinite(data.creditProfitFactor) &&
          data.creditProfitFactor > 0
        ) {
          setCreditProfitFactor(data.creditProfitFactor);
        }
      } catch (pricingConfigError) {
        if (pricingConfigError.name !== "AbortError") {
          console.error("[PRICING_CONFIG_ERROR]", pricingConfigError);
        }
      }
    }

    fetchPricingConfig();
    return () => controller.abort();
  }, []);

  const MODES = [
    { id: "text-to-video", label: "Text", fullLabel: "Text to Video", icon: FaBolt },
    { id: "image-to-video", label: "Image", fullLabel: "Image to Video", icon: IoImageOutline },
    { id: "reference-to-video", label: "Reference", fullLabel: "Reference to Video", icon: FaSyncAlt },
  ];

  const getReferencePreviewUrl = (reference) =>
    typeof reference === "string" ? reference : reference.previewUrl;

  const getReferenceDisplayName = (reference) =>
    typeof reference === "string"
      ? getDisplayName(reference)
      : reference.name;

  const getGenerationReference = (reference) =>
    typeof reference === "string" ? reference : { assetId: reference.assetId };

  const isManagedReference = (reference) =>
    typeof reference !== "string" && Boolean(reference.assetId);

  const getReferencesBySource = (references, source) =>
    references
      .map((reference, index) => ({ reference, index }))
      .filter(({ reference }) =>
        source === "managed"
          ? isManagedReference(reference)
          : !isManagedReference(reference),
      );

  const createReferenceItem = (type, reference) => ({
    id: `${type}-${Date.now()}-${referenceOrderRef.current}`,
    order: referenceOrderRef.current++,
    type,
    reference,
  });

  const removeReferenceItem = (type, index) => {
    setReferenceItems((items) => {
      let seen = 0;
      return items.filter((item) => {
        if (item.type !== type) return true;
        if (seen === index) {
          seen += 1;
          return false;
        }
        seen += 1;
        return true;
      });
    });
  };

  const getOrderedReferenceUrls = (type, fallback) => {
    const ordered = referenceItems
      .filter((item) => item.type === type)
      .sort((a, b) => a.order - b.order)
      .map((item) => item.reference);

    return ordered.length === fallback.length ? ordered : fallback;
  };

  const getDisplayName = (url) => {
    const cleanUrl = url.split(/[?#]/)[0];
    return decodeURIComponent(cleanUrl.split("/").pop() || url);
  };

  const referenceOptions = (() => {
    const counts = { image: 0, video: 0, audio: 0 };

    return referenceItems
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((item) => {
        counts[item.type] += 1;
        const label = `${item.type}${counts[item.type]}`;

        return {
          ...item,
          label,
          token: `@${label}`,
        };
      });
  })();

  const addManagedAsset = (asset) => {
    const type = asset.type.toLowerCase();
    const reference = {
      assetId: asset.id,
      previewUrl: asset.previewUrl,
      name: asset.name,
    };
    const imageLimit =
      mode === "image-to-video" ? IMAGE_TO_VIDEO_MAX_IMAGES : 9;

    if (type === "image" && imagesList.length < imageLimit) {
      setImagesList([...imagesList, reference]);
    } else if (type === "video" && videoFiles.length < 3) {
      setVideoFiles([...videoFiles, reference]);
    } else if (type === "audio" && audioFiles.length < 3) {
      setAudioFiles([...audioFiles, reference]);
    } else {
      setError(`The ${type} reference limit has been reached.`);
      setAssetPickerType(null);
      return;
    }

    setReferenceItems((items) => [...items, createReferenceItem(type, reference)]);
    setAssetPickerType(null);
  };

  const addUploadedReference = (type, url) => {
    if (type === "image" && imagesList.length < 9) {
      setImagesList([...imagesList, url]);
    } else if (type === "video" && videoFiles.length < 3) {
      setVideoFiles([...videoFiles, url]);
    } else if (type === "audio" && audioFiles.length < 3) {
      setAudioFiles([...audioFiles, url]);
    } else {
      setError(`The ${type} reference limit has been reached.`);
      return false;
    }

    setReferenceItems((items) => [...items, createReferenceItem(type, url)]);
    return true;
  };

  const handleModeChange = (nextMode) => {
    setMode(nextMode);

    if (nextMode !== "reference-to-video") {
      setReferencePickerOpen(false);
      setReferenceTriggerIndex(null);
    }

    if (nextMode === "image-to-video") {
      setImagesList((items) => items.slice(0, IMAGE_TO_VIDEO_MAX_IMAGES));
      setReferenceItems((items) => {
        let imageCount = 0;

        return items.filter((item) => {
          if (item.type !== "image") return true;
          imageCount += 1;
          return imageCount <= IMAGE_TO_VIDEO_MAX_IMAGES;
        });
      });
    }
  };

  const handlePromptChange = (event) => {
    const nextPrompt = event.target.value;
    const cursorPosition = event.target.selectionStart ?? nextPrompt.length;

    setPrompt(nextPrompt);

    if (mode === "reference-to-video" && nextPrompt[cursorPosition - 1] === "@") {
      setReferenceTriggerIndex(cursorPosition - 1);
      setReferencePickerOpen(true);
      return;
    }

    if (
      referenceTriggerIndex !== null &&
      nextPrompt[referenceTriggerIndex] !== "@"
    ) {
      setReferencePickerOpen(false);
      setReferenceTriggerIndex(null);
    }
  };

  const insertReferenceToken = (option) => {
    const startIndex =
      referenceTriggerIndex ?? promptInputRef.current?.selectionStart ?? prompt.length;
    const before = prompt.slice(0, startIndex);
    const after = prompt.slice(startIndex + 1);
    const spacer = after && !after.startsWith(" ") ? " " : "";
    const nextPrompt = `${before}${option.token}${spacer}${after}`;
    const nextCursorPosition = before.length + option.token.length + spacer.length;

    setPrompt(nextPrompt);
    setReferencePickerOpen(false);
    setReferenceTriggerIndex(null);

    requestAnimationFrame(() => {
      promptInputRef.current?.focus();
      promptInputRef.current?.setSelectionRange(
        nextCursorPosition,
        nextCursorPosition,
      );
    });
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (imagesList.length >= IMAGE_TO_VIDEO_MAX_IMAGES) return;

    try {
      setIsUploading(true);
      setError(null);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed.");
      const data = await res.json();
      if (data.url) {
        setImagesList([...imagesList, data.url]);
        setReferenceItems((items) => [
          ...items,
          createReferenceItem("image", data.url),
        ]);
      }
    } catch (err) {
      setError("Upload failed.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleReferenceUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = file.name.toLowerCase().split(".").pop();
    const type = ["png", "jpg", "jpeg"].includes(extension)
      ? "image"
      : ["mp4", "mov"].includes(extension)
        ? "video"
        : ["mp3", "wav"].includes(extension)
          ? "audio"
          : null;

    if (!type) {
      setError("Upload a supported image, video, or audio file.");
      return;
    }
    if (
      (type === "image" && imagesList.length >= 9) ||
      (type === "video" && videoFiles.length >= 3) ||
      (type === "audio" && audioFiles.length >= 3)
    ) {
      setError(`The ${type} reference limit has been reached.`);
      return;
    }

    try {
      setIsUploadingReference(true);
      setError(null);
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Reference upload failed.");
      const data = await res.json();
      if (data.url) {
        addUploadedReference(type, data.url);
      }
    } catch (err) {
      setError("Reference upload failed.");
    } finally {
      setIsUploadingReference(false);
      if (referenceInputRef.current) referenceInputRef.current.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!session) {
      signIn();
      return;
    }
    if (mode === "text-to-video" && !prompt.trim()) return;
    if (
      mode !== "text-to-video" &&
      imagesList.length === 0 &&
      mode !== "reference-to-video"
    ) {
      setError("Please add at least one reference image.");
      return;
    }

    try {
      const orderedImagesList = getOrderedReferenceUrls("image", imagesList).map(
        getGenerationReference,
      );
      const orderedVideoFiles = getOrderedReferenceUrls("video", videoFiles).map(
        getGenerationReference,
      );
      const orderedAudioFiles = getOrderedReferenceUrls("audio", audioFiles).map(
        getGenerationReference,
      );

      setLoading(true);
      setError(null);
      setResultUrl(null);
      setStatusMessage("Starting generation...");

      const res = await fetch("/api/seedance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          prompt,
          aspect_ratio: aspectRatio,
          resolution: effectiveResolution,
          duration,
          model,
          seed,
          camera_fixed: cameraFixed,
          generate_audio: generateAudio,
          images_list: orderedImagesList,
          video_files: orderedVideoFiles,
          audio_files: orderedAudioFiles,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed.");
      await pollStatus(data.request_id, data.metadata);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const pollStatus = async (requestId, metadata) => {
    setStatusMessage("Processing...");
    try {
      const res = await fetch("/api/seedance/check-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, metadata }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Status check failed.");

      if (data.status === "completed") {
        setResultUrl(data.videoUrl);
        setLoading(false);
      } else if (data.status === "failed") {
        throw new Error(data.error || "Generation failed.");
      } else {
        setTimeout(() => pollStatus(requestId, metadata), 10000);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const availableResolutions = canSelect1080p
    ? RESOLUTIONS
    : RESOLUTIONS.filter((option) => option.value !== "1080p");

  const handleModelChange = (nextModel) => {
    setModel(nextModel);
    if (nextModel === "seedance-2.0-fast" && resolution === "1080p") {
      setResolution("720p");
    }
  };

  const estimatedCredit = getEstimatedSeedanceCreditCost({
    duration,
    resolution: effectiveResolution,
    aspectRatio,
    model,
    hasVideoInput: mode === "reference-to-video" && videoFiles.length > 0,
    profitFactor: creditProfitFactor,
  });

  const activeMode = MODES.find((m) => m.id === mode) || MODES[0];
  const referenceCount =
    imagesList.length + videoFiles.length + audioFiles.length;
  const canGenerate =
    !loading &&
    ((mode === "text-to-video" && prompt.trim()) ||
      (mode === "image-to-video" && imagesList.length > 0) ||
      (mode === "reference-to-video" && referenceCount > 0));

  const renderImageReferences = (source, label) => {
    const references = getReferencesBySource(imagesList, source);
    if (references.length === 0) return null;

    return (
      <div className="space-y-2">
        {label && (
          <div className="text-[9px] font-semibold uppercase tracking-widest text-muted">
            {label}
          </div>
        )}
        <div className="grid grid-cols-5 gap-2">
          {references.map(({ reference, index }) => (
            <div
              key={`${source}-image-${index}`}
              className="group relative aspect-square overflow-hidden rounded-md border border-glass-border bg-white/[0.055]"
            >
              <Image
                src={getReferencePreviewUrl(reference)}
                alt={`Reference image ${index + 1}`}
                fill
                unoptimized
                sizes="(max-width: 768px) 20vw, 96px"
                className="object-cover"
              />
              <button
                onClick={() => {
                  setImagesList(imagesList.filter((_, itemIndex) => itemIndex !== index));
                  removeReferenceItem("image", index);
                }}
                className="absolute right-1.5 top-1.5 hidden rounded bg-red-500/90 p-1 text-white group-hover:flex"
                aria-label={`Remove image ${index + 1}`}
              >
                <FaTrash className="text-[10px]" />
              </button>
              <div className="absolute bottom-1 right-1 rounded bg-black/65 px-1 text-[8px] font-bold text-white">
                @image{index + 1}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderVideoReferences = (source, label) => {
    const references = getReferencesBySource(videoFiles, source);
    if (references.length === 0) return null;

    return (
      <div className="space-y-2">
        {label && (
          <div className="text-[9px] font-semibold uppercase tracking-widest text-muted">
            {label}
          </div>
        )}
        <div className="grid grid-cols-5 gap-2">
          {references.map(({ reference, index }) => (
            <div
              key={`${source}-video-${index}`}
              className="group relative aspect-square overflow-hidden rounded-md border border-glass-border bg-white/[0.055]"
            >
              <video
                src={getReferencePreviewUrl(reference)}
                className="h-full w-full object-cover"
              />
              <button
                onClick={() => {
                  setVideoFiles(videoFiles.filter((_, itemIndex) => itemIndex !== index));
                  removeReferenceItem("video", index);
                }}
                className="absolute right-1.5 top-1.5 hidden rounded bg-red-500/90 p-1 text-white group-hover:flex"
                aria-label={`Remove video ${index + 1}`}
              >
                <FaTrash className="text-[10px]" />
              </button>
              <div className="absolute bottom-1 right-1 rounded bg-black/65 px-1 text-[8px] text-white">
                @video{index + 1}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAudioReferences = (source, label) => {
    const references = getReferencesBySource(audioFiles, source);
    if (references.length === 0) return null;

    return (
      <div className="space-y-2">
        {label && (
          <div className="text-[9px] font-semibold uppercase tracking-widest text-muted">
            {label}
          </div>
        )}
        <div className="space-y-2">
          {references.map(({ reference, index }) => (
            <div
              key={`${source}-audio-${index}`}
              className="group flex items-center justify-between gap-3 rounded-md border border-glass-border bg-white/[0.055] p-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FaMusic className="shrink-0 text-[10px] text-muted" />
                <span className="truncate text-[10px] text-foreground">
                  {getReferenceDisplayName(reference)}
                </span>
                <span className="shrink-0 text-[8px] font-bold text-primary-500">
                  @audio{index + 1}
                </span>
              </div>
              <button
                onClick={() => {
                  setAudioFiles(audioFiles.filter((_, itemIndex) => itemIndex !== index));
                  removeReferenceItem("audio", index);
                }}
                className="text-muted transition-colors hover:text-red-500"
                aria-label={`Remove audio ${index + 1}`}
              >
                <FaTrash className="text-[10px]" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex-1 w-full overflow-y-auto custom-scrollbar">
      <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(148,163,184,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.12)_1px,transparent_1px)] [background-size:44px_44px]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(183,255,60,0.2),transparent_58%)]" />

      <main className="relative mx-auto flex min-h-full w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-8 md:py-8">
        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl space-y-4"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-secondary-500/30 bg-secondary-500/10 px-3 py-1.5 text-[10px] font-semibold uppercase text-secondary-500 shadow-sm backdrop-blur-2xl">
              <span className="h-1.5 w-1.5 rounded-full bg-secondary-500 shadow-[0_0_16px_var(--secondary-500)]" />
              Universal Engine
            </div>
            <div className="space-y-3">
              <h1 className="max-w-3xl text-4xl font-semibold leading-[1.04] text-foreground md:text-6xl">
                Seedance X video center
              </h1>
              <p className="max-w-2xl text-sm leading-7 text-muted md:text-base">
                Compose cinematic video from text, images, and reference media
                inside a sharper generation workspace.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="grid grid-cols-3 gap-2 rounded-lg border border-glass-border bg-glass-bg p-2 shadow-2xl shadow-black/20 backdrop-blur-2xl sm:min-w-[360px]"
          >
            <div className="rounded-md bg-white/[0.055] p-3">
              <div className="text-[10px] font-medium uppercase text-muted">
                Mode
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-foreground">
                {activeMode.label}
              </div>
            </div>
            <div className="rounded-md bg-white/[0.055] p-3">
              <div className="text-[10px] font-medium uppercase text-muted">
                Output
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {effectiveResolution}
              </div>
            </div>
            <div className="rounded-md bg-white/[0.055] p-3">
              <div className="text-[10px] font-medium uppercase text-muted">
                Estimated Credits
              </div>
              <div className="mt-1 text-sm font-semibold text-foreground">
                {estimatedCredit} CR
              </div>
            </div>
          </motion.div>
        </section>

        <section className="grid flex-1 gap-6 lg:grid-cols-[minmax(360px,0.88fr)_minmax(0,1.12fr)]">
          {/* Left: Controls */}
          <div className="flex flex-col gap-5 rounded-xl border border-glass-border bg-[linear-gradient(135deg,rgba(12,18,32,0.9),rgba(7,11,20,0.72))] p-4 shadow-2xl shadow-black/30 backdrop-blur-3xl md:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-glass-border pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-white shadow-xl shadow-primary-500/20">
                  <FaMagic />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Seedance Generator
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {activeMode.fullLabel}
                  </p>
                </div>
              </div>
              <div className="rounded-full border border-secondary-500/25 bg-secondary-500/10 px-3 py-1 text-[10px] font-semibold uppercase text-secondary-500">
                Live
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg border border-glass-border bg-white/[0.045] p-1.5">
              {MODES.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => handleModeChange(m.id)}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-md px-2 text-xs font-semibold transition-all ${
                      mode === m.id
                        ? "bg-[linear-gradient(135deg,var(--secondary-500),var(--primary-500))] text-white shadow-lg shadow-secondary-500/15"
                        : "text-muted hover:bg-white/[0.07] hover:text-foreground"
                    }`}
                  >
                    <Icon className="shrink-0 text-[13px]" />
                    <span className="sm:hidden">{m.label}</span>
                    <span className="hidden sm:inline">{m.fullLabel}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-semibold uppercase text-muted">
                  Prompt
                </label>
                <div className="relative">
                  <textarea
                    ref={promptInputRef}
                    value={prompt}
                    onChange={handlePromptChange}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") {
                        setReferencePickerOpen(false);
                        setReferenceTriggerIndex(null);
                      }
                    }}
                    placeholder={
                      mode === "reference-to-video"
                        ? "Type @ to reference uploaded files...\nExample: @video1 in the style of @image1 with @audio1"
                        : "Describe camera motion, scene, subject, and visual atmosphere..."
                    }
                    className="h-40 w-full resize-none rounded-lg border border-glass-border bg-white/[0.055] p-4 text-sm leading-6 text-foreground outline-none transition-colors placeholder:text-muted/60 focus:border-secondary-500/60 custom-scrollbar"
                  />
                  <AnimatePresence>
                    {mode === "reference-to-video" && referencePickerOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 6 }}
                        className="absolute left-3 right-3 top-12 z-50 overflow-hidden rounded-lg border border-glass-border bg-[rgba(7,16,6,0.96)] shadow-2xl shadow-black/40 backdrop-blur-2xl"
                      >
                        <div className="border-b border-glass-border px-3 py-2 text-[10px] font-semibold uppercase text-muted">
                          Reference files
                        </div>
                        {referenceOptions.length === 0 ? (
                          <div className="px-3 py-4 text-xs text-muted">
                            Upload or select a reference file first.
                          </div>
                        ) : (
                          <div className="max-h-56 overflow-y-auto custom-scrollbar p-1">
                            {referenceOptions.map((option) => {
                              const Icon =
                                option.type === "image"
                                  ? IoImageOutline
                                  : option.type === "video"
                                    ? FaVideo
                                    : FaMusic;

                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    insertReferenceToken(option);
                                  }}
                                  className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-glass-hover"
                                >
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-secondary-500/20 bg-secondary-500/10 text-secondary-500">
                                    <Icon className="text-sm" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-xs font-semibold text-foreground">
                                      {option.token}
                                    </span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {mode === "image-to-video" && (
                <div className="space-y-3 border-t border-glass-border pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[10px] font-semibold uppercase text-muted">
                      Images
                    </label>
                    <span className="text-[10px] font-medium text-muted">
                      {imagesList.length}/{IMAGE_TO_VIDEO_MAX_IMAGES}
                    </span>
                  </div>
                  <div
                    className={`grid gap-2 ${hasAssetsAccess ? "grid-cols-2" : "grid-cols-1"}`}
                  >
                    <input
                      type="file"
                      ref={fileInputRef}
                      hidden
                      accept=".png, .jpg, .jpeg"
                      onChange={handleFileUpload}
                    />
                    <button
                      onClick={() => {
                        if (!session) {
                          signIn();
                          return;
                        }
                        fileInputRef.current?.click();
                      }}
                      disabled={
                        isUploading ||
                        imagesList.length >= IMAGE_TO_VIDEO_MAX_IMAGES
                      }
                      className="flex h-10 items-center justify-center gap-2 rounded-md border border-secondary-500/25 bg-secondary-500/10 px-3 text-[10px] font-semibold uppercase tracking-wider text-secondary-500 transition-colors hover:bg-secondary-500 hover:text-slate-950 disabled:opacity-50"
                      aria-label="Upload image"
                    >
                      {isUploading ? (
                        <div className="h-4 w-4 rounded-full border-2 border-secondary-500 border-t-transparent animate-spin" />
                      ) : (
                        <IoImageOutline />
                      )}
                      Upload
                    </button>
                    {hasAssetsAccess && (
                      <button
                        onClick={() => setAssetPickerType("Image")}
                        disabled={
                          imagesList.length >= IMAGE_TO_VIDEO_MAX_IMAGES
                        }
                        className="flex h-10 items-center justify-center gap-2 rounded-md border border-glass-border bg-white/[0.055] px-3 text-[10px] font-semibold uppercase tracking-wider text-secondary-500 transition-colors hover:bg-secondary-500 hover:text-slate-950 disabled:opacity-50"
                      >
                        <FaFolderOpen />
                        My Assets
                      </button>
                    )}
                  </div>
                  {renderImageReferences("uploaded", "Uploaded Files")}
                  {hasAssetsAccess && renderImageReferences("managed", "My Assets")}
                </div>
              )}

              {mode === "reference-to-video" && (
                <div className="space-y-5 border-t border-glass-border pt-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[10px] font-semibold uppercase text-muted">
                        Reference Media
                      </label>
                      <span className="text-[10px] font-medium text-muted">
                        {referenceCount} selected
                      </span>
                    </div>
                    <div
                      className={`grid gap-2 ${hasAssetsAccess ? "grid-cols-2" : "grid-cols-1"}`}
                    >
                      <input
                        type="file"
                        ref={referenceInputRef}
                        hidden
                        accept=".png,.jpg,.jpeg,.mp4,.mov,.mp3,.wav"
                        onChange={handleReferenceUpload}
                      />
                      <button
                        onClick={() => {
                          if (!session) {
                            signIn();
                            return;
                          }
                          referenceInputRef.current?.click();
                        }}
                        disabled={isUploadingReference}
                        className="flex h-10 items-center justify-center gap-2 rounded-md border border-secondary-500/25 bg-secondary-500/10 px-3 text-[10px] font-semibold uppercase tracking-wider text-secondary-500 transition-colors hover:bg-secondary-500 hover:text-slate-950 disabled:opacity-50"
                        aria-label="Upload reference media"
                      >
                        {isUploadingReference ? (
                          <div className="h-4 w-4 rounded-full border-2 border-secondary-500 border-t-transparent animate-spin" />
                        ) : (
                          <FaSyncAlt />
                        )}
                        Upload
                      </button>
                      {hasAssetsAccess && (
                        <button
                          onClick={() => setAssetPickerType("All")}
                          className="flex h-10 items-center justify-center gap-2 rounded-md border border-glass-border bg-white/[0.055] px-3 text-[10px] font-semibold uppercase tracking-wider text-secondary-500 transition-colors hover:bg-secondary-500 hover:text-slate-950"
                        >
                          <FaFolderOpen />
                          My Assets
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[10px] font-semibold uppercase text-muted">
                        Images
                      </label>
                      <span className="text-[10px] font-medium text-muted">
                        {imagesList.length}/9
                      </span>
                    </div>
                    {imagesList.length === 0 && (
                      <p className="text-[11px] text-muted">No image references selected.</p>
                    )}
                    {renderImageReferences("uploaded")}
                    {hasAssetsAccess && renderImageReferences("managed", "My Assets")}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[10px] font-semibold uppercase text-muted">
                        Video Clips
                      </label>
                      <span className="text-[10px] font-medium text-muted">
                        {videoFiles.length}/3
                      </span>
                    </div>
                    {videoFiles.length === 0 && (
                      <p className="text-[11px] text-muted">No video references selected.</p>
                    )}
                    {renderVideoReferences("uploaded")}
                    {hasAssetsAccess && renderVideoReferences("managed", "My Assets")}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[10px] font-semibold uppercase text-muted">
                        Audio Clips
                      </label>
                      <span className="text-[10px] font-medium text-muted">
                        {audioFiles.length}/3
                      </span>
                    </div>
                    {audioFiles.length === 0 && (
                      <p className="text-[11px] text-muted">No audio references selected.</p>
                    )}
                    {renderAudioReferences("uploaded")}
                    {hasAssetsAccess && renderAudioReferences("managed", "My Assets")}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 border-t border-glass-border pt-5">
                <CustomSelect
                  label="Aspect Ratio"
                  value={aspectRatio}
                  options={ASPECT_RATIOS}
                  onChange={setAspectRatio}
                />
                <CustomSelect
                  label="Resolution"
                  value={effectiveResolution}
                  options={availableResolutions}
                  onChange={setResolution}
                />
                <CustomSelect
                  label="Duration"
                  value={duration}
                  options={DURATIONS}
                  onChange={setDuration}
                />
                <CustomSelect
                  label="Model"
                  value={model}
                  options={MODELS}
                  onChange={handleModelChange}
                />
              </div>
              <div className="border-t border-glass-border pt-5">
                <button
                  type="button"
                  onClick={() => setAdvancedSettingsOpen((isOpen) => !isOpen)}
                  className="flex w-full items-center justify-between text-left text-[10px] font-semibold uppercase tracking-wider text-muted transition-colors hover:text-foreground"
                  aria-expanded={advancedSettingsOpen}
                >
                  Advanced Settings
                  <FaChevronDown
                    className={`text-[10px] transition-transform ${
                      advancedSettingsOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {advancedSettingsOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-4 pt-4">
                        <label className="block space-y-1.5">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
                            Seed
                          </span>
                          <input
                            type="number"
                            step="1"
                            value={seed}
                            onChange={(event) => setSeed(event.target.value)}
                            className="w-full rounded-md border border-glass-border bg-glass-bg px-3 py-2 text-xs font-medium text-foreground outline-none transition-colors hover:bg-glass-hover focus:border-primary-500"
                          />
                        </label>
                        <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-medium text-foreground">
                          Camera Fixed
                          <input
                            type="checkbox"
                            checked={cameraFixed}
                            onChange={(event) =>
                              setCameraFixed(event.target.checked)
                            }
                            className="h-4 w-4 accent-primary-500"
                          />
                        </label>
                        <label className="flex cursor-pointer items-center justify-between gap-3 text-xs font-medium text-foreground">
                          Generate Audio
                          <input
                            type="checkbox"
                            checked={generateAudio}
                            onChange={(event) =>
                              setGenerateAudio(event.target.checked)
                            }
                            className="h-4 w-4 accent-primary-500"
                          />
                        </label>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="mt-auto space-y-3 border-t border-glass-border pt-5">
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="group flex w-full items-center justify-center gap-3 rounded-lg bg-[linear-gradient(135deg,var(--secondary-500),var(--primary-500))] py-3 text-sm font-semibold text-white shadow-xl shadow-secondary-500/20 transition-all hover:brightness-110 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? (
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <>
                    Generate
                  <span className="rounded-full bg-slate-950/25 px-2 py-0.5 text-[10px]">
                      Estimated: {estimatedCredit} Credits
                    </span>
                  </>
                )}
              </button>

              {error && (
                <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-center text-[11px] font-medium text-red-600">
                  {error}
                </p>
              )}
            </div>
          </div>

          {/* Right: Preview */}
          <div className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-glass-border bg-[#030805] text-white shadow-2xl shadow-black/35">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3 md:px-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-secondary-500/25 bg-secondary-500/10 text-secondary-500">
                  <FaBolt />
                </div>
                <div>
                  <h2 className="text-sm font-semibold">Preview Stream</h2>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {resultUrl
                      ? "Generation complete"
                      : loading
                        ? statusMessage
                        : "Awaiting render"}
                  </p>
                </div>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300">
                  {aspectRatio}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] text-slate-300">
                  {effectiveResolution}
                </span>
              </div>
            </div>

            <div className="group relative flex flex-1 items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_32%,rgba(183,255,60,0.18),transparent_34%),linear-gradient(145deg,#020402,#071407_60%,#102006)] p-4 md:p-6">
              <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(183,255,60,0.12))]" />

              {resultUrl ? (
                <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-5">
                  <div className="relative w-full overflow-hidden rounded-lg border border-white/10 bg-black shadow-2xl">
                    <video
                      src={resultUrl}
                      className="aspect-video h-full w-full object-contain"
                      controls
                      autoPlay
                      muted
                      loop
                      playsInline
                    />
                    <div className="absolute right-4 top-4 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={() =>
                          downloadMedia(resultUrl, `seedance-${Date.now()}.mp4`)
                        }
                        className="rounded-full bg-white p-3 text-slate-950 shadow-2xl transition-transform hover:scale-105 active:scale-95"
                        aria-label="Download generated video"
                      >
                        <FiDownload className="text-xl" />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    <span className="rounded-full border border-primary-400/20 bg-primary-500/15 px-3 py-1 text-[10px] font-medium text-primary-200">
                      {activeMode.fullLabel}
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium text-slate-300">
                      {model}
                    </span>
                  </div>
                </div>
              ) : loading ? (
                <div className="relative z-10 flex flex-col items-center gap-5 text-center">
                  <div className="relative flex h-20 w-20 items-center justify-center">
                    <div className="absolute inset-0 rounded-full border border-primary-400/20" />
                    <div className="h-16 w-16 rounded-full border-2 border-primary-400/20 border-t-primary-400 animate-spin" />
                    <FaMagic className="absolute text-primary-300" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">{statusMessage}</p>
                    <p className="text-xs text-slate-400">
                      Seedance X is synthesizing your timeline.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="relative z-10 flex max-w-sm flex-col items-center gap-4 text-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-primary-300 shadow-2xl">
                    <FaMagic className="text-2xl" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-base font-semibold">Video Preview</p>
                    <p className="text-sm leading-6 text-slate-400">
                      Your generated clip will appear here with playback and
                      download controls.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      {hasAssetsAccess && (
        <ManagedAssetPicker
          type={assetPickerType}
          onClose={() => setAssetPickerType(null)}
          onSelect={addManagedAsset}
        />
      )}
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 0px;
        }
        .custom-scrollbar {
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
