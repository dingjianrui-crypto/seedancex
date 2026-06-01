"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  FaChevronLeft,
  FaChevronRight,
  FaCloudUploadAlt,
  FaDatabase,
  FaImage,
  FaMusic,
  FaShieldAlt,
  FaSyncAlt,
  FaTrash,
  FaVideo,
} from "react-icons/fa";

const PAGE_SIZE = 12;

function AssetTypeIcon({ type, className = "" }) {
  const Icon = type === "Image" ? FaImage : type === "Video" ? FaVideo : FaMusic;
  return <Icon className={className} />;
}

function AssetPreview({ asset }) {
  if (asset.type === "Image") {
    return (
      <Image
        src={asset.previewUrl}
        alt={asset.name}
        fill
        unoptimized
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
        className="h-full w-full object-cover"
      />
    );
  }

  if (asset.type === "Video") {
    return (
      <video
        src={asset.previewUrl}
        className="h-full w-full object-cover"
        muted
        playsInline
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-secondary-500/10 text-secondary-500">
      <FaMusic className="text-4xl" />
    </div>
  );
}

function StatusBadge({ status }) {
  const classes =
    status === "Active"
      ? "border-secondary-500/25 bg-secondary-500/10 text-secondary-500"
      : status === "Failed"
        ? "border-red-500/25 bg-red-500/10 text-red-400"
        : "border-amber-400/25 bg-amber-400/10 text-amber-300";

  return (
    <span
      className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest ${classes}`}
    >
      {status}
    </span>
  );
}

export default function AssetsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const fileInputRef = useRef(null);
  const [assets, setAssets] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState("");
  const [assetName, setAssetName] = useState("");

  const fetchAssets = useCallback(
    async ({ refresh = false } = {}) => {
      if (!session) {
        setAssets([]);
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
          ...(refresh ? { refresh: "true" } : {}),
        });
        const response = await fetch(`/api/assets?${params}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load assets.");
        }

        setAssets(data.items);
        setTotalPages(data.totalPages);
      } catch (fetchError) {
        setError(fetchError.message);
      } finally {
        setLoading(false);
      }
    },
    [page, session],
  );

  useEffect(() => {
    if (sessionStatus === "loading") return undefined;

    const timer = setTimeout(() => {
      fetchAssets();
    }, 0);

    return () => clearTimeout(timer);
  }, [fetchAssets, sessionStatus]);

  useEffect(() => {
    if (!assets.some((asset) => asset.status === "Processing")) return undefined;

    const interval = setInterval(() => {
      fetchAssets({ refresh: true });
    }, 10000);

    return () => clearInterval(interval);
  }, [assets, fetchAssets]);

  const handleUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploading(true);
      setError("");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", assetName.trim() || file.name);
      const response = await fetch("/api/assets", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Asset upload failed.");
      }

      setAssetName("");
      setPage(1);
      await fetchAssets({ refresh: true });
    } catch (uploadError) {
      setError(uploadError.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDelete = async (asset) => {
    if (deletingId) return;
    if (!window.confirm(`Delete "${asset.name}" from your managed assets?`)) return;

    try {
      setDeletingId(asset.id);
      setError("");
      const response = await fetch("/api/assets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: asset.id }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Asset deletion failed.");
      }

      await fetchAssets();
    } catch (deleteError) {
      setError(deleteError.message);
    } finally {
      setDeletingId(null);
    }
  };

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-500/30 border-t-primary-500" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-transparent px-4 py-6 custom-scrollbar md:px-8 md:py-10">
      <main className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-3">
          <div className="flex items-center gap-3 text-primary-500">
            <FaDatabase className="text-sm" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.4em]">
              Trusted Asset Library
            </span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            MY ASSETS
          </h1>
          <p className="max-w-2xl text-xs font-medium uppercase leading-loose tracking-widest text-muted">
            Register reusable image, video, and audio references for Seedance generation.
          </p>
        </header>

        <section className="flex gap-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-4 text-amber-100">
          <FaShieldAlt className="mt-0.5 shrink-0 text-amber-300" />
          <p className="text-xs leading-5">
            Upload only digital assets that you lawfully own or are authorized to use.
            Assets must not infringe third-party rights, include unauthorized trademarks,
            or violate applicable laws. Trusted virtual-person assets must comply with
            Volcengine private asset library requirements.
          </p>
        </section>

        <section className="space-y-4 rounded-xl border border-glass-border bg-glass-bg p-4 shadow-xl backdrop-blur-3xl md:p-5">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Upload Requirements</h2>
            <p className="mt-1 text-xs text-muted">
              Each uploaded file must satisfy the requirements for its media type.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-lg border border-glass-border bg-white/[0.045] p-4">
              <div className="flex items-center gap-2 text-secondary-500">
                <FaImage />
                <h3 className="text-xs font-semibold uppercase tracking-widest">Image</h3>
              </div>
              <ul className="mt-3 space-y-1.5 text-[11px] leading-5 text-muted">
                <li>Formats: jpeg, png, webp, bmp, tiff, gif, heic, or heif.</li>
                <li>Aspect ratio (width / height): greater than 0.4 and less than 2.5.</li>
                <li>Width and height: greater than 300 px and less than 6000 px.</li>
                <li>File size: less than 30 MB per image.</li>
              </ul>
            </article>

            <article className="rounded-lg border border-glass-border bg-white/[0.045] p-4">
              <div className="flex items-center gap-2 text-secondary-500">
                <FaVideo />
                <h3 className="text-xs font-semibold uppercase tracking-widest">Video</h3>
              </div>
              <ul className="mt-3 space-y-1.5 text-[11px] leading-5 text-muted">
                <li>Formats: mp4 or mov.</li>
                <li>Resolution: 480p or 720p.</li>
                <li>Duration: 2 to 15 seconds per video.</li>
                <li>Aspect ratio (width / height): 0.4 to 2.5.</li>
                <li>Width and height: 300 to 6000 px.</li>
                <li>Total pixels: 409,600 to 927,408 pixels.</li>
                <li>File size: no more than 50 MB per video.</li>
                <li>Frame rate: 24 to 60 FPS.</li>
              </ul>
            </article>

            <article className="rounded-lg border border-glass-border bg-white/[0.045] p-4">
              <div className="flex items-center gap-2 text-secondary-500">
                <FaMusic />
                <h3 className="text-xs font-semibold uppercase tracking-widest">Audio</h3>
              </div>
              <ul className="mt-3 space-y-1.5 text-[11px] leading-5 text-muted">
                <li>Formats: wav or mp3.</li>
                <li>Duration: 2 to 15 seconds per audio file.</li>
                <li>File size: no more than 15 MB per audio file.</li>
              </ul>
            </article>
          </div>
        </section>

        {session ? (
          <>
            <section className="grid gap-3 rounded-xl border border-glass-border bg-glass-bg p-4 shadow-xl backdrop-blur-3xl md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:p-5">
              <div className="space-y-2">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-muted">
                  Asset Name
                </label>
                <input
                  value={assetName}
                  onChange={(event) => setAssetName(event.target.value)}
                  maxLength={64}
                  placeholder="Optional display name. Defaults to the file name."
                  className="w-full rounded-md border border-glass-border bg-white/[0.055] px-3 py-3 text-xs text-foreground outline-none placeholder:text-muted/60 focus:border-secondary-500/60"
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".jpeg,.jpg,.png,.webp,.bmp,.tiff,.gif,.heic,.heif,.mp4,.mov,.wav,.mp3"
                onChange={handleUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center justify-center gap-2 rounded-md bg-[linear-gradient(135deg,var(--secondary-500),var(--primary-500))] px-5 py-3 text-xs font-semibold text-white shadow-lg shadow-secondary-500/15 transition-all hover:brightness-110 disabled:opacity-50"
              >
                {uploading ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  <FaCloudUploadAlt />
                )}
                {uploading ? "Registering..." : "Upload Asset"}
              </button>
            </section>

            {error && (
              <p className="rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {error}
              </p>
            )}

            {assets.length === 0 ? (
              <section className="flex flex-col items-center justify-center gap-4 rounded-xl border border-glass-border bg-glass-bg py-28 text-center backdrop-blur-3xl">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-glass-border bg-glass-hover text-muted">
                  <FaDatabase className="text-2xl" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground">
                    No Managed Assets
                  </h2>
                  <p className="mt-2 text-xs text-muted">
                    Upload an authorized reference file to start your library.
                  </p>
                </div>
              </section>
            ) : (
              <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {assets.map((asset, index) => (
                  <motion.article
                    key={asset.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04 }}
                    className="overflow-hidden rounded-xl border border-glass-border bg-glass-bg shadow-lg backdrop-blur-3xl"
                  >
                    <div className="relative aspect-video overflow-hidden bg-black/25">
                      <AssetPreview asset={asset} />
                      {asset.status === "Processing" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/45">
                          <FaSyncAlt className="animate-spin text-xl text-primary-400" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold text-foreground">
                            {asset.name}
                          </h2>
                          <div className="mt-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted">
                            <AssetTypeIcon type={asset.type} />
                            {asset.type}
                          </div>
                        </div>
                        <StatusBadge status={asset.status} />
                      </div>
                      {asset.status === "Failed" && (
                        <p className="rounded-md border border-red-500/20 bg-red-500/10 p-2 text-[11px] leading-4 text-red-300">
                          {asset.errorMessage || "Asset processing failed."}
                        </p>
                      )}
                      <button
                        onClick={() => handleDelete(asset)}
                        disabled={deletingId === asset.id}
                        className="flex w-full items-center justify-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-red-300 transition-colors hover:bg-red-500 hover:text-white disabled:opacity-50"
                      >
                        {deletingId === asset.id ? (
                          <div className="h-3 w-3 animate-spin rounded-full border-2 border-red-100/30 border-t-red-100" />
                        ) : (
                          <FaTrash />
                        )}
                        Delete
                      </button>
                    </div>
                  </motion.article>
                ))}
              </section>
            )}

            <nav className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="rounded-md border border-glass-border bg-glass-bg p-3 text-muted transition-colors hover:text-foreground disabled:opacity-40"
                aria-label="Previous asset page"
              >
                <FaChevronLeft />
              </button>
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="rounded-md border border-glass-border bg-glass-bg p-3 text-muted transition-colors hover:text-foreground disabled:opacity-40"
                aria-label="Next asset page"
              >
                <FaChevronRight />
              </button>
            </nav>
          </>
        ) : (
          <section className="rounded-xl border border-glass-border bg-glass-bg p-12 text-center backdrop-blur-3xl">
            <h2 className="text-lg font-semibold text-foreground">Sign in to manage assets</h2>
            <button
              onClick={() => signIn()}
              className="mt-5 rounded-md bg-primary-500 px-6 py-3 text-xs font-semibold uppercase tracking-widest text-white"
            >
              Sign In
            </button>
          </section>
        )}
      </main>
    </div>
  );
}
