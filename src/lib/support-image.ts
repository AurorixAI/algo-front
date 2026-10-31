"use client";

import { JPEG_QUALITIES, SUPPORT_TARGET_FILE_BYTES, scaledSize, sendAsIs } from "./support";

export const SCREENSHOT_UNREADABLE = "Не удалось прочитать снимок. Приложите JPEG или PNG.";
export const SCREENSHOT_TOO_BIG = "Снимок слишком большой даже после сжатия. Приложите другой или обрежьте его.";

async function decode(file: File): Promise<{ draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h), width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
    } catch { /* an image the bitmap decoder does not know: the <img> element below may */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(SCREENSHOT_UNREADABLE));
      el.src = url;
    });
    return { draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h), width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * The picture that goes to the server.  A PNG of the screen within the limit goes as it is.  Anything else is drawn again as a JPEG with the long side at most 1600
 * (a photo of a phone is 3-8 MB; the HEIC of an iPhone is not accepted by the server; the place and the time of the shot stay in the old file, not in the new one).
 */
export async function prepareScreenshot(file: File): Promise<{ blob: Blob; name: string }> {
  if (sendAsIs(file)) return { blob: file, name: file.name || "screenshot.png" };
  const source = await decode(file).catch(() => { throw new Error(SCREENSHOT_UNREADABLE); });
  try {
    const { width, height } = scaledSize(source.width, source.height);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(SCREENSHOT_UNREADABLE);
    ctx.fillStyle = "#ffffff"; // a transparent PNG becomes white, not black, as a JPEG
    ctx.fillRect(0, 0, width, height);
    source.draw(ctx, width, height);
    for (const quality of JPEG_QUALITIES) {
      const blob = await toBlob(canvas, quality);
      if (blob && blob.size <= SUPPORT_TARGET_FILE_BYTES) return { blob, name: "screenshot.jpg" };
    }
    throw new Error(SCREENSHOT_TOO_BIG);
  } finally {
    source.close();
  }
}
