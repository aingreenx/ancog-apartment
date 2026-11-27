// Draws the app icons into public/icons (run: node scripts/make-icons.mjs).
// Colors are the app palette: deep green #14452F, off-white #F9F9F6, terracotta #C05746.
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const GREEN = "#14452F";
const CREAM = "#F9F9F6";
const TERRA = "#C05746";

// A house with a door, drawn on a 100×100 grid centred at 50,50 and scaled by `s`.
const house = (s, color = CREAM, door = TERRA) => `
  <g transform="translate(50 52) scale(${s}) translate(-50 -50)">
    <path d="M50 14 L88 46 L80 46 L80 86 L20 86 L20 46 L12 46 Z" fill="${color}" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>
    <rect x="41" y="58" width="18" height="28" rx="2" fill="${door}"/>
    <circle cx="55" cy="72" r="1.8" fill="${color}"/>
  </g>`;

const svg = ({ rounded, scale, bg = GREEN, fg = CREAM, door = TERRA }) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    ${bg ? `<rect width="100" height="100" rx="${rounded ? 22 : 0}" fill="${bg}"/>` : ""}
    ${house(scale, fg, door)}
  </svg>`);

mkdirSync("public/icons", { recursive: true });
const out = (buf, size, file) => sharp(buf, { density: 600 }).resize(size, size).png().toFile(file);

await Promise.all([
  // "any": rounded tile, house fills most of it.
  out(svg({ rounded: true, scale: 0.8 }), 192, "public/icons/icon-192.png"),
  out(svg({ rounded: true, scale: 0.8 }), 512, "public/icons/icon-512.png"),
  // "maskable": full-bleed, house inside the 80% safe circle.
  out(svg({ rounded: false, scale: 0.6 }), 192, "public/icons/maskable-192.png"),
  out(svg({ rounded: false, scale: 0.6 }), 512, "public/icons/maskable-512.png"),
  // iOS Home Screen (iOS rounds the corners itself).
  out(svg({ rounded: false, scale: 0.72 }), 180, "src/app/apple-icon.png"),
  // Android status-bar badge: white on transparent.
  out(
    svg({ bg: null, scale: 0.9, fg: "#FFFFFF", door: "transparent" }),
    96,
    "public/icons/badge-96.png",
  ),
  // Browser tab.
  out(svg({ rounded: true, scale: 0.8 }), 32, "src/app/icon.png"),
]);
console.log("Icons written.");
