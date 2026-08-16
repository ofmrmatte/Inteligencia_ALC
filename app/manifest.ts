import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Portal do Motorista ALC",
    short_name: "Motorista ALC",
    description: "Pendências, pagamentos e contestações dos motoristas ALC.",
    start_url: "/motorista",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#e30613",
    icons: [
      { src: "/brand/alc-symbol.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/alc-logo.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
