import next from "eslint-config-next";

export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "build/**",
      "src/generated/**",
    ],
  },
  ...next,
  {
    // React-hooks plugin 7.x вводить нові строгі правила. Поки приглушуємо
    // до warning — переписувати всі useEffect одним махом не security-critical.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
    },
  },
];
