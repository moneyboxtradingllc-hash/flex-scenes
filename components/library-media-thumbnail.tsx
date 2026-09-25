"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { MediaAsset } from "@/lib/domain";

const subscribeToHydration = () => () => {};
const getHydratedSnapshot = () => true;
const getServerSnapshot = () => false;

export function LibraryMediaThumbnail({
  asset,
  className = "",
  alt = "",
  loading = "lazy",
  style,
  onStateChange,
}: {
  asset: MediaAsset;
  className?: string;
  alt?: string;
  loading?: "eager" | "lazy";
  style?: CSSProperties;
  onStateChange?: (assetId: string, state: "image" | "poster" | "video-frame" | "video-loading" | "unavailable") => void;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [posterFailed, setPosterFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);
  const [frameReady, setFrameReady] = useState(false);
  const clientReady = useSyncExternalStore(subscribeToHydration, getHydratedSnapshot, getServerSnapshot);
  const isVideo = asset.type === "video";
  const tryVideo = isVideo && (!asset.posterUrl || posterFailed);

  useEffect(() => {
    if (!tryVideo) return;
    const node = hostRef.current;
    if (!node || !("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [tryVideo]);

  const unavailable = isVideo ? videoFailed || (tryVideo && !asset.url) : imageFailed || !asset.url;
  const thumbnailState = unavailable ? "unavailable" : isVideo && tryVideo ? frameReady ? "video-frame" : "video-loading" : isVideo ? "poster" : "image";

  useEffect(() => {
    onStateChange?.(asset.id, thumbnailState);
  }, [asset.id, onStateChange, thumbnailState]);
  const fallbackText = isVideo ? "Video preview unavailable" : "Image unavailable";

  return (
    <span
      ref={hostRef}
      className={`library-thumb-shell ${className}`.trim()}
      style={style}
      role="img"
      aria-label={alt || asset.title || (isVideo ? "Video" : "Image")}
      data-testid="library-media-thumbnail"
      data-media-kind={asset.type}
      data-thumbnail-state={thumbnailState}
    >
      {unavailable ? (
        <span className="library-media-fallback" data-testid="library-thumbnail-fallback" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="m5 17 4-4 3 3 2-2 5 4"/></svg>
          <small>{fallbackText}</small>
        </span>
      ) : !clientReady ? (
        <span className="library-media-placeholder" aria-hidden="true">{isVideo && <span className="library-media-play-mark">▶</span>}</span>
      ) : isVideo && tryVideo ? (
        <>
          {!frameReady && <span className="library-media-placeholder" aria-hidden="true"><span className="library-media-play-mark">▶</span></span>}
          {nearViewport && asset.url && !videoFailed && <video
            className="library-thumb"
            src={asset.url}
            muted
            playsInline
            preload="metadata"
            tabIndex={-1}
            aria-hidden="true"
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (Number.isFinite(video.duration) && video.duration > 0.2) {
                try { video.currentTime = Math.min(0.12, video.duration / 5); } catch { /* First decoded frame remains usable. */ }
              }
            }}
            onLoadedData={() => setFrameReady(true)}
            onError={() => setVideoFailed(true)}
          />}
        </>
      ) : isVideo && asset.posterUrl ? (
        <img
          className="library-thumb"
          src={asset.posterUrl}
          alt={alt}
          loading={loading}
          decoding="async"
          onError={() => setPosterFailed(true)}
        />
      ) : (
        <img
          className="library-thumb"
          src={asset.url}
          alt={alt}
          loading={loading}
          decoding="async"
          onError={() => setImageFailed(true)}
        />
      )}
    </span>
  );
}

export function LibraryCharacterPortrait({ src, name }: { src: string; name: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;
  if (failed) return <span className="library-character-portrait-fallback" role="img" aria-label={`${name} portrait`}>{name.trim().charAt(0).toLocaleUpperCase() || "•"}</span>;
  return <img src={src} alt="" loading="lazy" onError={() => setFailedSrc(src)} />;
}
