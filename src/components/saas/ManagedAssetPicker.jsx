"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { FaImage, FaMusic, FaTimes, FaVideo } from "react-icons/fa";

function AssetIcon({ type }) {
  const Icon = type === "Image" ? FaImage : type === "Video" ? FaVideo : FaMusic;
  return <Icon />;
}

function AssetPreview({ asset }) {
  if (asset.type === "Image") {
    return (
      <Image
        src={asset.previewUrl}
        alt={asset.name}
        fill
        unoptimized
        sizes="(max-width: 640px) 50vw, 25vw"
        className="h-full w-full object-cover"
      />
    );
  }

  if (asset.type === "Video") {
    return <video src={asset.previewUrl} muted playsInline className="h-full w-full object-cover" />;
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-secondary-500/10 text-secondary-500">
      <FaMusic className="text-xl" />
    </div>
  );
}

export function ManagedAssetPicker({ type, onClose, onSelect }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!type) return undefined;

    const controller = new AbortController();

    async function fetchAssets() {
      try {
        setLoading(true);
        setError("");
        const response = await fetch("/api/assets?status=Active&pageSize=100", {
          signal: controller.signal,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load managed assets.");
        }

        setAssets(
          type === "All"
            ? data.items
            : data.items.filter((asset) => asset.type === type),
        );
      } catch (fetchError) {
        if (fetchError.name !== "AbortError") {
          setError(fetchError.message);
        }
      } finally {
        setLoading(false);
      }
    }

    fetchAssets();
    return () => controller.abort();
  }, [type]);

  return (
    <AnimatePresence>
      {type && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.98, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl border border-glass-border bg-[rgba(7,16,6,0.97)] shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-glass-border px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {type === "All" ? "Choose Managed Assets" : `Choose Managed ${type}`}
                </h2>
                <p className="mt-1 text-[11px] text-muted">Only active assets can be used for generation.</p>
              </div>
              <button onClick={onClose} className="text-muted transition-colors hover:text-foreground" aria-label="Close managed asset picker">
                <FaTimes />
              </button>
            </header>

            <div className="max-h-[65vh] overflow-y-auto p-4 custom-scrollbar">
              {loading ? (
                <div className="flex justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500/30 border-t-primary-500" />
                </div>
              ) : error ? (
                <p className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">{error}</p>
              ) : assets.length === 0 ? (
                <p className="py-16 text-center text-xs text-muted">
                  No active {type === "All" ? "" : `${type.toLowerCase()} `}assets are available.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {assets.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => onSelect(asset)}
                      className="overflow-hidden rounded-lg border border-glass-border bg-white/[0.045] text-left transition-colors hover:border-secondary-500/60 hover:bg-glass-hover"
                    >
                      <div className="relative aspect-video overflow-hidden bg-black/20">
                        <AssetPreview asset={asset} />
                      </div>
                      <div className="space-y-1 p-3">
                        <span className="block truncate text-xs font-semibold text-foreground">{asset.name}</span>
                        <span className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest text-muted">
                          <AssetIcon type={asset.type} />
                          {asset.type}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
