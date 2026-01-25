import js from "@eslint/js";
import globals from "globals";
import json from "@eslint/json";
import { defineConfig } from "eslint/config";
import jest from "eslint-plugin-jest";
import jsdoc from "eslint-plugin-jsdoc";

export default defineConfig([
  {
    ignores: [
      ".vscode/",
      "package-lock.json",
      "__mocks__/",
    ],
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    plugins: {
      js,
      jsdoc, // Add jsdoc plugin
    },
    extends: [
      "js/recommended",
    ],
    languageOptions: { globals: globals.node },
    rules: {
      "no-unused-vars": ["error", { "caughtErrors": "none" }],
      "no-useless-escape": "off",
      // JSDoc rules for all JS files
      "jsdoc/require-description": "warn",
      "jsdoc/check-values": "warn",
      "jsdoc/empty-tags": "warn",
      "jsdoc/no-bad-blocks": "warn",
      "jsdoc/require-param": "warn",
      "jsdoc/require-returns": "warn",
      "jsdoc/check-param-names": "warn",
      "jsdoc/check-tag-names": "warn",
      "jsdoc/require-jsdoc": ["warn", { // Enforce JSDoc on functions and classes
        "require": {
          "FunctionDeclaration": true,
          "MethodDefinition": true,
          "ClassDeclaration": true,
          "ArrowFunctionExpression": true,
          "FunctionExpression": true
        }
      }],
    },
  },
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  { files: ["**/*.json"], plugins: { json }, language: "json/json", extends: ["json/recommended"] },
  // Jest configuration for test files
  {
    files: ["**/*.test.js"],
    ...jest.configs["flat/recommended"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
]);
