import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      react: resolve(__dirname, "node_modules/react"),
      "react-dom": resolve(__dirname, "node_modules/react-dom"),
      "react-dom/client": resolve(__dirname, "node_modules/react-dom/client"),
      "react/jsx-dev-runtime": resolve(__dirname, "node_modules/react/jsx-dev-runtime.js"),
      "react/jsx-runtime": resolve(__dirname, "node_modules/react/jsx-runtime.js"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom/client", "react/jsx-dev-runtime"],
    force: true,
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        componentDrafts: resolve(__dirname, "component-drafts.html"),
        onboardingPreview: resolve(__dirname, "onboarding-preview.html"),
      },
    },
  },
});
