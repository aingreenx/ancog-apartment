import type { MetadataRoute } from "next";

// Installable app (#27).
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Ancog Apartment",
    short_name: "Ancog",
    description: "Rent, electricity and payments for Ancog Apartment",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F9F9F6",
    theme_color: "#14452F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
