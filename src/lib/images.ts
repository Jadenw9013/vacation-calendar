"use client";

import type { FileUIPart } from "ai";

/**
 * Screenshots are shrunk in the browser before they're sent: long side at
 * most 1600 px (plenty to read a confirmation), re-encoded as JPEG, stepping
 * quality and then size down until it's under ~450 KB. Keeps requests well
 * under Vercel's 4.5 MB body limit even with four images.
 */
export const MAX_IMAGES = 4;
const MAX_SIDE = 1600;
const TARGET_BYTES = 450_000;
const QUALITIES = [0.82, 0.72, 0.62, 0.5];

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't encode image"))), "image/jpeg", quality),
  );
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function compressImage(file: Blob, index: number): Promise<FileUIPart> {
  if (!file.type.startsWith("image/")) throw new Error("Only images can be attached.");
  const bitmap = await createImageBitmap(file);
  try {
    let side = Math.min(MAX_SIDE, Math.max(bitmap.width, bitmap.height));
    for (let attempt = 0; attempt < 4; attempt++) {
      const scale = side / Math.max(bitmap.width, bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext("2d")!;
      // JPEG has no transparency: paint white first so PNG screenshots don't go black.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const q of QUALITIES) {
        const blob = await toBlob(canvas, q);
        if (blob.size <= TARGET_BYTES) {
          // Generic name: the original filename can contain names or booking codes.
          return { type: "file", mediaType: "image/jpeg", filename: `screenshot-${index + 1}.jpg`, url: await toDataUrl(blob) };
        }
      }
      side = Math.round(side * 0.75);
    }
    throw new Error("That image is too large even after shrinking it. Try a tighter crop.");
  } finally {
    bitmap.close();
  }
}
