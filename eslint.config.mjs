// 코드 모양 검사. 설치 없이 돌린다:  npx eslint@9 js api app
// 규칙은 일부러 적게 둔다 — 고칠 수 있는 것만 경고하고, 지금 코드를 한꺼번에 바꾸게 하지는 않는다.
export default [
  {
    ignores: ['app/vendor/**', 'tools/data/**', 'docs/**'],
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
    },
    rules: {
      // 한두 글자 이름은 짧은 콜백·반복문에서만. 넓게 쓰이는 이름은 뜻을 담는다
      // (x·y 좌표, i·j 반복 번호, t 시각, k 비율, b 상자/버튼, 정렬 비교의 a·b, 판 크기 상수 W·H·S·R 같은 관용 이름은 둔다)
      'id-length': ['warn', { min: 2, exceptionPatterns: ['^[ijkxyntab_]$', '^[WHSR]$'], properties: 'never' }],
      'no-shadow': 'warn',
      'prefer-const': 'warn',
      'no-unused-vars': ['warn', { args: 'none' }],
      eqeqeq: ['warn', 'smart'],
    },
  },
];
