# tools/data

- `nikl-vocab.tsv` — 국립국어원 「한국어 학습용 어휘 목록」(2003). 원본은 국립국어원 누리집의 텍스트 파일(cp949)이며, UTF-8 로 바꾸기만 했습니다.
  칸: 순위 · 단어(뒤의 숫자는 동음이의어 번호) · 품사 · 풀이(한자·원어) · 등급(A~C).
  출처: 국립국어원, 공공누리 제1유형(출처 표시) — https://www.korean.go.kr/front_eng/down/down_02V.do?etc_seq=70
  같은 글자 넣기(`js/games/blank.js`)의 문제 낱말로 쓴다 (`tools/blank-build.js`).

거르는 사전(hunspell-dict-ko, 위키낱말사전 한국어 낱말)은 GPL·CC BY-SA 자료라 저장소에 넣지 않습니다.
`node tools/blank-build.js` 가 처음 돌 때 `tools/.cache/` 에 내려받습니다.
