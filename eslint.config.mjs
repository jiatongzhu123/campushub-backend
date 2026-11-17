import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/coverage/**",
      "**/build/**",
      "**/.cache/**",
    ],
  },
  {
    files: ["src/**/*.ts", "shared/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      // The backend uses TypeScript's import-equals syntax for CommonJS modules.
      "@typescript-eslint/no-require-imports": ["error", { allowAsImport: true }],
      // Callback signatures retain intentionally unused parameters with _ names.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
