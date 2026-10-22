import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trip",
    short_name: "Trip",
    description: "Your group's trip: what's next, where you're sleeping, and everything you saved. Works with no signal.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f1f3f2",
    theme_color: "#f1f3f2",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Android: "Share" from TikTok, Instagram, Maps or a browser lists the app; the link lands on /share.
    share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
  } as MetadataRoute.Manifest;
}
