"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { extractFigureUrls } from "@/lib/figures";

interface TaskFigureDrawerProps {
  /** Single URL, comma-separated URLs, or array of URLs */
  imageUrl?: string | string[] | null;
  /** Optional title or caption */
  title?: string;
  /** Whether to show a compact button or a larger badge */
  variant?: "pill" | "badge" | "button";
  /** Optional custom trigger class name */
  className?: string;
  /** If true, renders a clean inline preview of the drawing that can be clicked to open full lightbox */
  inlinePreview?: boolean;
}

export function TaskFigureDrawer({
  imageUrl,
  title = "Чертёж к задаче",
  variant = "pill",
  className = "",
  inlinePreview = false,
}: TaskFigureDrawerProps) {
  const urls = extractFigureUrls(imageUrl);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const activeUrl = urls[activeIndex] || urls[0] || null;

  // Reset zoom & pan when figure changes or modal opens/closes
  const resetTransform = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleOpen = () => {
    resetTransform();
    setImageLoaded(false);
    setImageError(false);
    setIsOpen(true);
  };

  const handleClose = () => {
    setIsOpen(false);
    resetTransform();
  };

  // Zoom & Pan updater with auto-centering on zoom out
  const updateZoomAndPan = useCallback((updater: (prevZoom: number) => number) => {
    setZoom((prevZoom) => {
      const targetZoom = updater(prevZoom);
      const nextZoom = Math.min(Math.max(Number(targetZoom.toFixed(2)), 0.4), 4.0);

      if (nextZoom <= 1.0) {
        // Whenever we are at or below 100%, reset shift to center
        setPosition({ x: 0, y: 0 });
      } else if (prevZoom > 1) {
        // Proportionally scale pan offset when zooming out so image smoothly returns towards center
        const ratio = (nextZoom - 1) / (prevZoom - 1);
        setPosition((prevPos) => ({
          x: prevPos.x * Math.min(Math.max(ratio, 0), 1),
          y: prevPos.y * Math.min(Math.max(ratio, 0), 1),
        }));
      }
      return nextZoom;
    });
  }, []);

  // Keyboard shortcut: Esc to close, Left/Right for multi-images
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        handleClose();
      } else if (e.key === "ArrowRight" && urls.length > 1) {
        setActiveIndex((prev) => (prev + 1) % urls.length);
        resetTransform();
        setImageLoaded(false);
      } else if (e.key === "ArrowLeft" && urls.length > 1) {
        setActiveIndex((prev) => (prev - 1 + urls.length) % urls.length);
        resetTransform();
        setImageLoaded(false);
      } else if (e.key === "+" || e.key === "=") {
        updateZoomAndPan((z) => z + 0.2);
      } else if (e.key === "-") {
        updateZoomAndPan((z) => z - 0.2);
      } else if (e.key === "0") {
        resetTransform();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", onKeyDown);
      document.body.style.overflow = "hidden"; // Prevent background scrolling
    }
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, urls.length, resetTransform, updateZoomAndPan]);

  // Zoom helpers
  const handleZoomIn = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateZoomAndPan((prev) => prev + 0.2);
  };
  const handleZoomOut = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    updateZoomAndPan((prev) => prev - 0.2);
  };

  // Double click toggles zoom
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (zoom <= 1.05) {
      updateZoomAndPan(() => 2.0);
    } else {
      resetTransform();
    }
  };

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    updateZoomAndPan((prev) => prev + delta);
  };

  // Pan / Dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || zoom <= 1) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  if (!urls || urls.length === 0 || !activeUrl) {
    return null;
  }

  return (
    <>
      {/* 1. INLINE PREVIEW MODE (shows the drawing in natural size in the question card) */}
      {inlinePreview ? (
        <div className={`flex flex-col items-center gap-2 ${className}`}>
          <div
            role="button"
            tabIndex={0}
            aria-label="Открыть полноразмерный чертёж"
            onClick={handleOpen}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleOpen();
              }
            }}
            className="group relative cursor-zoom-in rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary-500 bg-white p-3 sm:p-4 border border-slate-200/90 shadow-sm hover:shadow-lg hover:border-primary-300 transition-all duration-200 max-w-full"
            title="Нажмите, чтобы открыть полноразмерный чертёж"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeUrl}
              alt="Иллюстрация к условию задачи"
              className="max-h-56 sm:max-h-64 max-w-full w-auto h-auto object-contain rounded-lg mx-auto"
            />
            {/* Floating hover badge */}
            <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 rounded-2xl transition-opacity flex items-center justify-center">
              <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 text-white text-xs font-bold shadow-lg">
                <svg className="w-4 h-4 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                </svg>
                Увеличить чертёж
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* 2. TRIGGER BUTTON MODE */
        <button
          type="button"
          onClick={handleOpen}
          className={`group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-all duration-200 shadow-xs border active:scale-95 focus:outline-none focus:ring-2 focus:ring-primary-500/20 ${
            variant === "pill"
              ? "bg-slate-50 hover:bg-slate-100/90 text-slate-700 hover:text-slate-900 border-slate-200/90 hover:border-slate-300 dark:bg-slate-800/80 dark:text-slate-200 dark:border-slate-700"
              : "bg-indigo-50/70 hover:bg-indigo-50 text-indigo-700 border-indigo-200/80 hover:border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-700"
          } ${className}`}
          title="Открыть полноразмерный чертёж к этой задаче"
        >
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-60"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500"></span>
          </span>
          <svg
            className="w-3.5 h-3.5 text-primary-600 dark:text-primary-400 group-hover:scale-110 transition-transform"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>Чертёж к задаче</span>
          {urls.length > 1 && (
            <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold">
              {urls.length}
            </span>
          )}
        </button>
      )}

      {/* 3. FULLSCREEN / MODAL LIGHTBOX */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[9990] flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 sm:p-6 md:p-10 select-none animate-in fade-in duration-200 cursor-zoom-out"
          onClick={handleClose}
        >
          {/* ALWAYS-VISIBLE FLOATING CLOSE BUTTON (TOP RIGHT) */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClose();
            }}
            className="fixed top-4 right-4 sm:top-6 sm:right-6 z-[9999] flex items-center gap-2 px-4 py-2.5 rounded-full bg-slate-900/95 text-white hover:bg-rose-600 hover:text-white border border-slate-700/90 shadow-2xl backdrop-blur-md text-xs sm:text-sm font-bold transition-all duration-200 active:scale-95 cursor-pointer"
            title="Закрыть (Esc)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span>Закрыть (Esc)</span>
          </button>

          {/* MULTI-FIGURE TABS (IF MULTIPLE) */}
          {urls.length > 1 && (
            <div
              className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-2 bg-slate-900/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-700 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="text-xs text-slate-400 font-medium">Чертежи:</span>
              {urls.map((_, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setActiveIndex(idx);
                    resetTransform();
                    setImageLoaded(false);
                    setImageError(false);
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    activeIndex === idx
                      ? "bg-primary-600 text-white shadow-md"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  Рисунок {idx + 1}
                </button>
              ))}
            </div>
          )}

          {/* MAIN IMAGE CARD (UNCONSTRAINED ORIGINAL RESOLUTION & CRISP CONTRAST) */}
          <div
            ref={containerRef}
            className={`relative max-w-full max-h-full flex items-center justify-center bg-white rounded-2xl p-4 sm:p-6 md:p-8 shadow-2xl border border-slate-200 select-none ${
              zoom > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
            }`}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
              transition: isDragging ? "none" : "transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onWheel={handleWheel}
          >
            {!imageLoaded && !imageError && (
              <div className="flex flex-col items-center justify-center p-12 gap-3 min-w-[240px] min-h-[200px]">
                <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-slate-600 font-semibold">Загрузка чертежа...</span>
              </div>
            )}

            {imageError && (
              <div className="flex flex-col items-center justify-center p-8 text-center gap-2">
                <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs text-rose-600 font-medium">Не удалось загрузить изображение</span>
              </div>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeUrl}
              alt="Иллюстрация к условию задачи"
              className={`max-w-[85vw] max-h-[75vh] w-auto h-auto object-contain rounded-lg transition-opacity duration-200 ${
                imageLoaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setImageLoaded(true);
                setImageError(true);
              }}
              draggable={false}
            />
          </div>

          {/* VERTICAL LEFT ZOOM CONTROLS (Non-obstructive) */}
          <div
            className="fixed left-4 sm:left-6 top-1/2 -translate-y-1/2 z-[9999] flex flex-col items-center gap-1.5 bg-slate-900/85 hover:bg-slate-900/95 backdrop-blur-md p-1.5 rounded-2xl border border-slate-700/80 shadow-2xl text-xs text-slate-200 select-none transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Zoom In */}
            <button
              type="button"
              onClick={handleZoomIn}
              className="p-2 sm:p-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/90 active:scale-90 transition-all"
              title="Увеличить (+)"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {/* Current Zoom / Reset */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                resetTransform();
              }}
              className="px-2 py-1 font-mono font-bold text-primary-400 hover:text-primary-300 rounded-lg hover:bg-slate-800/90 active:scale-95 transition-all text-[11px] sm:text-xs"
              title="Сбросить масштаб (100%)"
            >
              {Math.round(zoom * 100)}%
            </button>

            {/* Zoom Out */}
            <button
              type="button"
              onClick={handleZoomOut}
              className="p-2 sm:p-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/90 active:scale-90 transition-all"
              title="Уменьшить (-)"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
