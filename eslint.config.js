import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist/", "coverage/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.js", "scripts/*.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Promise-returning functions must be async so argument validation errors
      // surface as rejections rather than synchronous throws.
      "@typescript-eslint/promise-function-async": "error",
      // Required by the rule above: an async function may validate and then
      // return another promise without awaiting.
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["test/**/*.ts", "examples/**/*.ts"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
  {
    files: ["eslint.config.js", "scripts/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ["eslint.config.js", "scripts/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly" } },
    rules: { "@typescript-eslint/promise-function-async": "off" },
  },
);
