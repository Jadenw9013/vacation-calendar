"use client";

/**
 * A photo or screenshot as a JPEG small enough to send, sharp enough to read.
 * Phone screenshots are tall, so the short side is what keeps text legible:
 * it's capped separately from the long side.
 */
export async function shrink(file: File, { long = 1600, short = 1600, quality = 0.82 } = {}): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const big = Math.max(bitmap.width, bitmap.height);
    const small = Math.min(bitmap.width, bitmap.height);
    const scale = Math.min(1, long / big, short / small);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", quality);
  } catch {
    return null;
  }
}

/** Booking screenshots: a tall phone screenshot keeps about 1200px across, plenty for small print. */
export const shrinkScreenshot = (file: File) => shrink(file, { long: 2400, short: 1200, quality: 0.8 });
