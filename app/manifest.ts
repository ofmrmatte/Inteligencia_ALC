import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inteligência ALC",
    short_name: "Inteligência ALC",
    description: "Painel de inteligência operacional, pré-faturamento, PNR, risco e gestão logística ALC.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e30613",
    icons: [
      { src: "/brand/alc-symbol.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/alc-logo.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
