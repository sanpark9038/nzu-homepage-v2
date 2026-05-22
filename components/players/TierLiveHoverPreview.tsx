"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type LivePreview = {
  thumbnailUrl: string;
  playerName: string;
  broadcastTitle: string | null;
};

type PreviewPosition = {
  left: number;
  top: number;
  width: number;
};

const PREVIEW_MAX_WIDTH = 544;
const PREVIEW_MIN_WIDTH = 280;
const PREVIEW_GAP = 12;
const VIEWPORT_MARGIN = 16;
const PREVIEW_RATIO = 9 / 16;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getPreviewPosition(cardRect: DOMRect): PreviewPosition {
  const availableWidth = Math.max(0, window.innerWidth - VIEWPORT_MARGIN * 2);
  const width = Math.min(
    PREVIEW_MAX_WIDTH,
    Math.max(PREVIEW_MIN_WIDTH, availableWidth)
  );
  const height = width * PREVIEW_RATIO;
  const minLeft = VIEWPORT_MARGIN + width / 2;
  const maxLeft = Math.max(
    minLeft,
    window.innerWidth - VIEWPORT_MARGIN - width / 2
  );
  const left = clamp(cardRect.left + cardRect.width / 2, minLeft, maxLeft);
  const aboveTop = cardRect.top - height - PREVIEW_GAP;
  const belowTop = cardRect.bottom + PREVIEW_GAP;
  const maxTop = Math.max(
    VIEWPORT_MARGIN,
    window.innerHeight - VIEWPORT_MARGIN - height
  );
  const top =
    aboveTop >= VIEWPORT_MARGIN
      ? aboveTop
      : clamp(belowTop, VIEWPORT_MARGIN, maxTop);

  return {
    left,
    top: clamp(top, VIEWPORT_MARGIN, maxTop),
    width,
  };
}

function getPreviewAnchor(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest("[data-live-thumbnail-hover-anchor]") as HTMLElement | null;
}

export function TierLiveHoverPreviewLayer() {
  const activeAnchorRef = useRef<HTMLElement | null>(null);
  const activeThumbnailUrlRef = useRef<string | null>(null);
  const [shouldRender, setShouldRender] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [loadedThumbnailUrl, setLoadedThumbnailUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<LivePreview | null>(null);
  const [previewPosition, setPreviewPosition] =
    useState<PreviewPosition | null>(null);

  useEffect(() => {
    const showPreview = (anchor: HTMLElement) => {
      const thumbnailUrl = anchor.dataset.liveThumbnailUrl;
      const playerName = anchor.dataset.livePlayerName;
      const broadcastTitle = anchor.dataset.liveBroadcastTitle || null;

      if (!thumbnailUrl || !playerName) return;

      const isSamePreview =
        activeAnchorRef.current === anchor &&
        activeThumbnailUrlRef.current === thumbnailUrl;
      activeAnchorRef.current = anchor;
      activeThumbnailUrlRef.current = thumbnailUrl;
      if (!isSamePreview) setLoadedThumbnailUrl(null);
      setPreview({
        thumbnailUrl,
        playerName,
        broadcastTitle,
      });
      setPreviewPosition(getPreviewPosition(anchor.getBoundingClientRect()));
      setShouldRender(true);
      setIsVisible(true);
    };

    const hidePreview = () => {
      setIsVisible(false);
    };

    const handlePointerOver = (event: PointerEvent) => {
      const anchor = getPreviewAnchor(event.target);
      if (!anchor) return;
      showPreview(anchor);
    };

    const handlePointerOut = (event: PointerEvent) => {
      const anchor = getPreviewAnchor(event.target);
      if (!anchor || anchor !== activeAnchorRef.current) return;
      if (
        event.relatedTarget instanceof Node &&
        anchor.contains(event.relatedTarget)
      ) {
        return;
      }

      hidePreview();
    };

    const handleFocusIn = (event: FocusEvent) => {
      const anchor = getPreviewAnchor(event.target);
      if (!anchor) return;
      showPreview(anchor);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const anchor = getPreviewAnchor(event.target);
      if (!anchor || anchor !== activeAnchorRef.current) return;
      if (
        event.relatedTarget instanceof Node &&
        anchor.contains(event.relatedTarget)
      ) {
        return;
      }

      hidePreview();
    };

    document.addEventListener("pointerover", handlePointerOver, { passive: true });
    document.addEventListener("pointerout", handlePointerOut, { passive: true });
    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver);
      document.removeEventListener("pointerout", handlePointerOut);
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  useEffect(() => {
    if (!isVisible) return;

    const updatePreviewPosition = () => {
      const anchor = activeAnchorRef.current;
      if (!anchor?.isConnected) {
        setIsVisible(false);
        return;
      }

      setPreviewPosition(getPreviewPosition(anchor.getBoundingClientRect()));
    };
    const scrollOptions: AddEventListenerOptions = {
      capture: true,
      passive: true,
    };

    window.addEventListener("resize", updatePreviewPosition);
    window.addEventListener("scroll", updatePreviewPosition, scrollOptions);

    return () => {
      window.removeEventListener("resize", updatePreviewPosition);
      window.removeEventListener("scroll", updatePreviewPosition, scrollOptions);
    };
  }, [isVisible]);

  const previewTitle = preview?.broadcastTitle || `${preview?.playerName || ""} LIVE`;
  const previewNode =
    shouldRender && preview && previewPosition
      ? createPortal(
          <div
            data-live-thumbnail-hover-preview
            className={`pointer-events-none fixed z-[999] hidden overflow-hidden rounded-2xl border border-white/10 bg-[#061015] transition-opacity duration-150 md:block ${
              isVisible ? "opacity-100" : "opacity-0"
            }`}
            style={{
              left: previewPosition.left,
              top: previewPosition.top,
              width: previewPosition.width,
              position: "fixed",
              transform: "translateX(-50%)",
            }}
          >
            <div className="relative aspect-video w-full bg-[linear-gradient(180deg,rgba(8,14,18,0.55),rgba(3,6,8,0.92))]">
              {loadedThumbnailUrl !== preview.thumbnailUrl ? (
                <div className="live-thumbnail-loading-placeholder absolute inset-0 bg-[radial-gradient(circle_at_22%_18%,rgba(46,213,115,0.22),transparent_30%),linear-gradient(135deg,rgba(8,18,20,0.98),rgba(3,7,10,0.98))]">
                  <div className="absolute left-3 top-3 rounded-full border border-nzu-green/28 bg-nzu-green/10 px-3 py-1.5 text-[12px] font-black tracking-tight text-nzu-green">
                    LIVE
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-3.5">
                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-black text-white/58">
                      <span className="h-1.5 w-1.5 rounded-full bg-nzu-green animate-pulse" />
                      {"\uBBF8\uB9AC\uBCF4\uAE30 \uBD88\uB7EC\uC624\uB294 \uC911"}
                    </div>
                    <div className="text-[12px] font-black text-nzu-green/85">{preview.playerName}</div>
                    <p className="mt-1 line-clamp-2 text-[0.98rem] font-black leading-snug text-white">
                      {previewTitle}
                    </p>
                  </div>
                </div>
              ) : null}
              <Image
                key={preview.thumbnailUrl}
                src={preview.thumbnailUrl}
                alt={`${preview.playerName} live preview`}
                fill
                unoptimized
                className={`object-cover transition-opacity duration-75 ${
                  loadedThumbnailUrl === preview.thumbnailUrl ? "opacity-100" : "opacity-0"
                }`}
                onLoad={() => setLoadedThumbnailUrl(preview.thumbnailUrl)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/25 to-transparent" />
              <div className="absolute left-3 top-3 rounded-full bg-black/85 px-3 py-1.5 text-[12px] font-black tracking-tight text-white">
                LIVE
              </div>
              <div className="absolute inset-x-0 bottom-0 p-3.5">
                <p className="line-clamp-2 text-[0.98rem] font-black leading-snug text-white">
                  {previewTitle}
                </p>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return previewNode;
}
