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
      // 이름은 뜻을 담는다 (h 대신 boxHeight). 한두 글자 줄임말은 쓰지 않는다.
      // 남겨 두는 것: i·j 반복 번호, x·y 좌표, 정렬 비교의 a·b, 낱말인 id·ok, node 의 fs, 선택 도우미 $.
      // 저장된 데이터·서버 형식처럼 바꿀 수 없는 속성 이름은 그 줄에서만 끈다.
      // 규칙이 못 잡는 세 글자 이상 줄임말(cnt, idx 같은)도 풀어 쓴다.
      'id-length': ['warn', { min: 3, exceptionPatterns: ['^[ijxyab_$]$', '^(id|ok|fs)$'], properties: 'always' }],
      'no-shadow': 'warn',
      'prefer-const': 'warn',
      'no-unused-vars': ['warn', { args: 'none' }],
      eqeqeq: ['warn', 'smart'],
    },
  },
];
