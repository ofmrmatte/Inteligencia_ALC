import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "dist/**",
      "coverage/**",
      "assets/**",
      "legacy/**",
      "supabase/**",
      "app.js",
      "authService.js",
      "config.js",
      "dashboardCacheService.js",
      "index.html",
      "railwayApiClient.js",
      "railwayStagingClient.js",
      "scripts/**",
      "styles.css",
    ],
  },
];

export default eslintConfig;
