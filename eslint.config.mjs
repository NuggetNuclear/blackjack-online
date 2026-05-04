import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".agents/**",
    // Legacy nested app artifacts that still exist locally after the root move.
    "blackjack-online/.next/**",
    "blackjack-online/node_modules/**",
    "blackjack-online/output/**",
  ]),
]);

export default eslintConfig;
