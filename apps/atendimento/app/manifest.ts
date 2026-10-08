import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ALC Atendimento",
    short_name: "Atendimento ALC",
    description: "Atendimento e acompanhamento de PNRs da ALC",
    lang: "pt-BR",
    start_url: "/conversas",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e30613",
    icons: [
      { src: "/brand/pwa-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/pwa-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
