import type { MetadataRoute } from "next";
import { PRODUCT_NAME, PRODUCT_DESCRIPTION } from "@/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: PRODUCT_NAME,
    short_name: PRODUCT_NAME,
    description: PRODUCT_DESCRIPTION,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6fa",
    theme_color: "#192f4d",
    icons: [
      { src: "/icon-192.png?v=voyroo", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png?v=voyroo", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png?v=voyroo", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android: "Share" from TikTok, Instagram, Maps or a browser lists the app; the link lands on /share.
    share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
  } as MetadataRoute.Manifest;
}
