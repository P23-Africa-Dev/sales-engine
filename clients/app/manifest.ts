import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sales Engine",
    short_name: "Sales Engine",
    description:
      "Find companies that match your profile, qualify them, and draft the note you send.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "portrait",
    background_color: "#143028",
    theme_color: "#143028",
    icons: [
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "Open workforce dashboard",
        url: "/dashboard",
      },
      {
        name: "Tasks",
        short_name: "Tasks",
        description: "Open task operations board",
        url: "/operations/all-tasks",
      },
      {
        name: "Projects",
        short_name: "Projects",
        description: "Open projects workspace",
        url: "/projects",
      },
    ],
    categories: ["business", "productivity"],
    prefer_related_applications: false,
  };
}

