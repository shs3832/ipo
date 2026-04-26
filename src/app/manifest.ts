import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IPO Calendar Alerts",
    short_name: "IPO Alerts",
    description: "공모주 일정 캘린더와 10시 분석 알림 대시보드",
    start_url: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/badge.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
