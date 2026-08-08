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
    // Project-specific non-app scripts/scratch work:
    "scripts/**",
    "tmp/**",
    ".tmp/**",
  ]),
  // React Compiler 규칙(set-state-in-effect)이 뒤늦게 켜지면서 이 규칙보다 먼저 만들어진
  // 화면들이 걸린다. 셋 다 "외부 시스템(실시간 채널·라우터·타이머)이 바뀌면 상태를 리셋"하는
  // 코드라 실제 버그는 아니다. 새로 짜는 화면은 규칙을 그대로 받는다 — 여기 목록에 추가하지 마라.
  {
    files: [
      "app/multiview/**",
      "components/Navbar.tsx",
      "components/starnews/news-widgets.tsx",
    ],
    rules: { "react-hooks/set-state-in-effect": "off" },
  },
]);

export default eslintConfig;
