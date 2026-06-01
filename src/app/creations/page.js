"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FaMagic,
  FaCalendarAlt,
  FaExpandAlt,
  FaMusic,
  FaTrash,
} from "react-icons/fa";
import { useRouter } from "next/navigation";
import { downloadMedia } from "@/lib/utils";
import { FiDownload } from "react-icons/fi";

async function requestCreations() {
  const res = await fetch("/api/creations");
  const data = await res.json();

  if (!res.ok) throw new Error(data.error || "Failed to fetch creations.");
  if (!Array.isArray(data)) throw new Error("Invalid creations response.");

  return data;
}

export default function CreationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [creations, setCreations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    if (status !== "authenticated") return undefined;

    let canceled = false;

    requestCreations()
      .then((data) => {
        if (!canceled) {
          setCreations(data);
          setLoadError(null);
        }
      })
      .catch((error) => {
        console.error("Error fetching creations:", error);
        if (!canceled) setLoadError(error.message);
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });

    return () => {
      canceled = true;
    };
  }, [status]);

  const handleRetry = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const data = await requestCreations();
      setCreations(data);
    } catch (error) {
      console.error("Error fetching creations:", error);
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const getCreationVideoUrl = (creation) => creation.videoUrl;
  const canDeleteCreation = (creation) => session?.user?.id === creation.userId;

  const handleDeleteCreation = async (creation) => {
    if (!canDeleteCreation(creation) || deletingId) return;
    const confirmed = window.confirm("Remove this creation from your gallery?");
    if (!confirmed) return;

    try {
      setDeletingId(creation.id);
      const res = await fetch("/api/creations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: creation.id }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Delete failed.");

      setCreations((items) => items.filter((item) => item.id !== creation.id));
      if (selectedImage?.id === creation.id) {
        setSelectedImage(null);
      }
    } catch (error) {
      console.error("Error deleting creation:", error);
    } finally {
      setDeletingId(null);
    }
  };

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex-1 flex items-center justify-center bg-transparent">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full drop-shadow-md"
        />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-transparent overflow-y-auto custom-scrollbar p-4 md:p-12">
      <header className="max-w-7xl mx-auto mb-10 space-y-3 pt-4 md:pt-0">
        <div className="flex items-center gap-3 text-primary-500 mb-1">
          <FaCalendarAlt className="text-sm" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.4em]">
            Historical Archive
          </span>
        </div>
        <h1 className="text-3xl md:text-5xl font-semibold tracking-tight text-foreground">
          {session ? "MY CREATIONS" : "GALLERY"}
        </h1>
        <p className="text-muted font-medium text-xs uppercase tracking-widest leading-loose max-w-xl">
          {session ? "Your generative legacy, manifested and stored." : "Sign in first to view your creations."}{" "}
          <br className="hidden md:block" />
          {session ? "Quick access to your visual nodes." : "Your gallery is private and only appears after login."}
        </p>
      </header>

      <div className="max-w-7xl mx-auto">
        {loadError ? (
          <div className="py-32 flex flex-col items-center justify-center text-center space-y-6">
            <div className="space-y-3">
              <h3 className="text-xl font-bold italic text-red-500">ARCHIVE UNAVAILABLE</h3>
              <p className="text-xs text-muted uppercase tracking-widest">{loadError}</p>
            </div>
            <button
              onClick={handleRetry}
              className="px-8 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-primary-500/20"
            >
              Retry
            </button>
          </div>
        ) : creations.length === 0 ? (
          session ? (
            <div className="py-32 flex flex-col items-center justify-center text-center space-y-8">
              <div className="w-20 h-20 rounded-3xl bg-glass-bg border border-glass-border flex items-center justify-center shadow-sm">
                <FaMagic className="text-3xl text-muted" />
              </div>
              <div className="space-y-4">
                <h3 className="text-xl font-bold italic text-foreground">COLLECTION EMPTY</h3>
                <button
                  onClick={() => router.push("/")}
                  className="px-8 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-primary-500/20"
                >
                  Start your first Manifestation
                </button>
              </div>
            </div>
          ) : null
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence>
              {creations.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group relative rounded-xl bg-glass-bg backdrop-blur-3xl border border-glass-border aspect-square cursor-pointer overflow-hidden shadow-sm hover:shadow-md transition-shadow transition-all"
                  onClick={() => setSelectedImage(item)}
                >
                  {canDeleteCreation(item) && (
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDeleteCreation(item);
                      }}
                      disabled={deletingId === item.id}
                      className="absolute top-3 left-3 z-20 w-8 h-8 rounded-lg bg-black/60 border border-white/10 text-white flex items-center justify-center transition-all hover:bg-red-500 disabled:opacity-50"
                      aria-label="Delete creation"
                    >
                      {deletingId === item.id ? (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : (
                        <FaTrash className="text-[10px]" />
                      )}
                    </button>
                  )}
                  {item.status === "completed" ? (
                    <video
                      src={getCreationVideoUrl(item)}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                      muted
                      autoPlay
                      loop
                      playsInline
                    />
                  ) : item.status === "failed" ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-red-500/10 gap-3">
                      <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center text-red-500">
                        <span className="font-bold whitespace-nowrap">✕</span>
                      </div>
                      <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Failed</span>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-glass-hover gap-4">
                      <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
                      <span className="text-[9px] font-black text-muted uppercase tracking-[0.2em] animate-pulse">Manifesting...</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 p-4 flex flex-col justify-end">
                    <p className="text-white text-xs font-semibold tracking-tight truncate mb-1">
                      {item.prompt}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-semibold text-primary-400 uppercase tracking-widest">
                        {item.aspectRatio}
                      </span>
                      <div className="w-8 h-8 rounded-lg bg-glass-hover border border-glass-border flex items-center justify-center text-white">
                        <FaExpandAlt className="text-[10px]" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Image Detail Modal */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1000] bg-black/20 backdrop-blur-sm p-4 md:p-12 flex flex-col items-center justify-center"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="relative max-w-6xl w-full h-full bg-glass-bg border border-glass-border rounded-xl overflow-hidden flex flex-col md:flex-row shadow-2xl backdrop-blur-3xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Image Side */}
              <div className="flex w-full md:w-[50%] h-[50%] md:h-full p-2 bg-glass-bg backdrop-blur-3xl flex border-b md:border-b-0 md:border-r border-glass-border">
                {selectedImage.status === "completed" ? (
                  <video
                    src={getCreationVideoUrl(selectedImage)}
                    className="h-full w-full object-contain"
                    controls
                    autoPlay
                    loop
                    playsInline
                  />
                ) : selectedImage.status === "failed" ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-red-500/5 gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center text-red-500 text-3xl">
                      ✕
                    </div>
                    <div className="text-center space-y-2">
                      <h3 className="text-sm font-bold text-red-500 uppercase tracking-widest">Generation Failed</h3>
                      <p className="text-xs text-muted max-w-xs">{selectedImage.error || "An unknown error occurred during manifestation."}</p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-glass-hover gap-6">
                    <div className="relative">
                      <div className="w-20 h-20 border-4 border-primary-500/10 border-t-primary-500 rounded-full animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <FaMagic className="text-primary-500/30 text-xl animate-pulse" />
                      </div>
                    </div>
                    <div className="text-center space-y-2">
                      <h3 className="text-sm font-black text-foreground uppercase tracking-[0.3em] animate-pulse">Generating...</h3>
                      <p className="text-[10px] text-muted uppercase tracking-widest">Bringing your vision to resonance</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Details Side */}
              <div className="flex w-full md:w-[50%] h-[50%] md:h-full p-6 flex flex-col bg-glass-bg backdrop-blur-3xl overflow-y-auto custom-scrollbar">
                <div className="flex flex-col justify-center space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs text-muted">
                      MANIFEST PARAMETERS
                    </div>
                    <p className="text-sm font-normal text-foreground leading-relaxed">
                      {selectedImage.prompt}
                    </p>
                  </div>

                  <div className="space-y-6 border-t border-white/5 pt-10">
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-1.5">
                        <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Ratio</div>
                        <div className="text-xs text-foreground font-medium">{selectedImage.aspectRatio}</div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Resolution</div>
                        <div className="text-xs text-foreground font-medium">{selectedImage.resolution}</div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Duration</div>
                        <div className="text-xs text-foreground font-medium">{selectedImage.duration ? `${selectedImage.duration}s` : "5s"}</div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Model</div>
                        <div className="text-xs text-foreground font-medium uppercase">{selectedImage.quality || "Seedance"}</div>
                      </div>
                    </div>
                    
                    <div className="space-y-4 border-t border-glass-border pt-6">
                      {selectedImage.inputImages?.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Image References</div>
                          <div className="grid grid-cols-4 gap-2">
                            {selectedImage.inputImages.map((img, i) => (
                              <div key={i} className="relative aspect-square rounded-md bg-glass-hover overflow-hidden border border-glass-border group">
                                <img src={img} alt="" className="w-full h-full object-cover" />
                                <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <a href={img} target="_blank" rel="noopener noreferrer" className="p-1 bg-black/60 rounded flex items-center justify-center">
                                    <FaExpandAlt className="text-[8px] text-white" />
                                  </a>
                                </div>
                                <div className="absolute bottom-1 right-1 bg-black/60 px-1 rounded text-[8px] text-white">@image{i+1}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedImage.videoFiles?.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Video References</div>
                          <div className="grid grid-cols-3 gap-2">
                            {selectedImage.videoFiles.map((v, i) => (
                              <div key={i} className="relative aspect-video rounded-md bg-glass-hover overflow-hidden border border-glass-border group">
                                <video src={v} className="w-full h-full object-cover" />
                                <div className="absolute top-0 right-0 p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <a href={v} target="_blank" rel="noopener noreferrer" className="p-1 bg-black/60 rounded flex items-center justify-center">
                                    <FaExpandAlt className="text-[8px] text-white" />
                                  </a>
                                </div>
                                <div className="absolute bottom-1 right-1 bg-black/60 px-1 rounded text-[8px] text-white">@video{i+1}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {selectedImage.audioFiles?.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Audio References</div>
                          <div className="space-y-2">
                            {selectedImage.audioFiles.map((a, i) => (
                              <div key={i} className="flex items-center gap-2 p-2 rounded-md bg-glass-hover border border-glass-border">
                                <FaMusic className="text-[10px] text-primary-500" />
                                <span className="text-[10px] text-foreground truncate flex-1">{a.split('/').pop()}</span>
                                <span className="text-[8px] text-muted font-bold">@audio{i+1}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5 pt-2">
                        <div className="text-[9px] font-semibold text-muted uppercase tracking-widest">Timestamp</div>
                        <div className="text-[11px] text-muted">
                          {new Date(selectedImage.createdAt).toLocaleString('en-US', { 
                            month: 'long', 
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-12">
                  <button
                    onClick={async () => {
                      if (selectedImage.status !== "completed") return;
                      setDownloading(true);
                      await downloadMedia(getCreationVideoUrl(selectedImage), `seedance-${selectedImage.id}.mp4`);
                      setDownloading(false);
                    }}
                    disabled={downloading || selectedImage.status !== "completed"}
                    className="w-full py-3 bg-gradient-to-r from-primary-600 to-primary-500 text-white rounded-lg font-bold tracking-wider uppercase text-xs flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 shadow-xl shadow-primary-500/20 border border-primary-400/50"
                  >
                    {downloading ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <FiDownload size={16} />
                    )}
                    {selectedImage.status === "completed" 
                      ? (downloading ? "Extracting..." : "Download Piece")
                      : selectedImage.status === "failed" 
                        ? "Generation Failed" 
                        : "Generating..."}
                  </button>
                </div>
              </div>

              {/* Close Button */}
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-6 right-6 w-8 h-8 flex items-center justify-center text-muted hover:text-white transition-colors"
              >
                <span className="text-xl">✕</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
