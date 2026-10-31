"use client";

import { JPEG_QUALITIES, SHRINK_ROUNDS, SHRINK_STEP, SUPPORT_TARGET_FILE_BYTES, scaledSize } from "./support";

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
 * The picture that goes to the server: ALWAYS drawn again on a canvas as a JPEG with the long side at most 2560 (R3-11).  A canvas carries no metadata, so the place and the time
 * of a photo (EXIF), the text blocks of a PNG and anything hidden in the file stay behind.  Too big a file after the lowest quality is made smaller and tried again.
 */
export async function prepareScreenshot(file: File): Promise<{ blob: Blob; name: string }> {
  const source = await decode(file).catch(() => { throw new Error(SCREENSHOT_UNREADABLE); });
  try {
    let { width, height } = scaledSize(source.width, source.height);
    for (let round = 0; round <= SHRINK_ROUNDS; round += 1) {
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
      width = Math.max(1, Math.round(width * SHRINK_STEP));
      height = Math.max(1, Math.round(height * SHRINK_STEP));
    }
    throw new Error(SCREENSHOT_TOO_BIG);
  } finally {
    source.close();
  }
}
