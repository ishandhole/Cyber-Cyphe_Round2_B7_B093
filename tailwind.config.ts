import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas:  "#0a0c12",
        base:    "#0d0f18",
        well:    "#10121c",
        surface: "#141720",
        raised:  "#1a1d2a",
        border:  "#1e2230",
        rimlo:   "#181b26",
        hi:      "#dce2f4",
        mid:     "#8892b0",
        lo:      "#404660",
        ghost:   "#2a2e40",
        teal:    "#3d9e95",
        gold:    "#b08040",
        rose:    "#a04060",
        sage:    "#4a8e64",
        indigo:  "#5a6898",
        plum:    "#6a5888",
        // status colours — slightly more restrained than v5
        ok:      "#4a8e64",
        warn:    "#b08040",
        crit:    "#a04060",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "sans-serif"],
        mono:    ["'IBM Plex Mono'", "monospace"],
        body:    ["'IBM Plex Sans'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
