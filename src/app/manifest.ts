import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RL Championship",
    short_name: "RL Champ",
    description: "Rocket League ligalari va kuboklari: jadvallar, o‘yinlar, reyting.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#081A32",
    theme_color: "#081A32",
    lang: "uz",
    icons: [
      { src: "/api/app-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/api/app-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/api/app-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Mening o‘yinlarim", url: "/me" },
      { name: "Musobaqalar", url: "/competitions" },
    ],
  };
}
