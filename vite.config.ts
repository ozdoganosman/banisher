import { defineConfig } from "vite";

// base "./": üretilen dosyalar göreli yollarla bağlanır; böylece aynı build
// GitHub Pages (/banisher/), Netlify/Vercel (kök) ve hatta yerel dosya
// açılışında sorunsuz çalışır.
export default defineConfig({
  base: "./",
});
