import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";
import pluginN from "eslint-plugin-n";

export default [
  js.configs.recommended,
  prettierConfig,
  {
    plugins: { n: pluginN },
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": "off",
      "n/no-missing-import": "error",
    },
  },
  {
    ignores: ["node_modules/"],
  },
];
