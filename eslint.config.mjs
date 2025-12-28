import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { 
    ignores: [
      ".next/**", 
      "node_modules/**", 
      "out/**", 
      "public/**", 
      ".vercel/**",
      "supabase/functions/**", // Ignore Deno functions as they have different env
      "ecosystem.config.js",
      "androidProvisioner/build/**",
      "src/integrations/supabase/types.ts",
      "src/integrations/supabase/database.types.ts"
    ] 
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
      "prefer-const": "warn"
    }
  }
);