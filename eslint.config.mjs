import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
    },
  },
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "prisma/**",
      "scripts/**",
      "uploads/**",
      "generate-icons.js",
      "public/sw.js",
      "tmp_*.js",
      "tmp_*.ts",
      "*.config.js",
    ],
  },
];

export default eslintConfig;