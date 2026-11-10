// 운영 버전(app/index.html)의 파일 주소 끝 ?v= 를 새 값으로 바꾸고, 가져오기 지도(importmap)를 다시 만든다.
// GitHub Pages 에 올릴 때 .github/workflows/pages.yml 이 커밋 번호를 값으로 넣어 돌린다 (node tools/stamp.js <값>).
// 손으로 돌릴 일은 없다. 값 없이 돌리면 오늘 날짜를 쓴다 (새 모듈 파일을 더한 뒤 저장소의 지도를 맞춰 두고 싶을 때).
//
// 왜: 브라우저는 고친 파일과 예전 파일을 섞어 쓰다 멈출 수 있다 (대기 화면이 안 뜨고 빈 화면).
// 스크립트는 ES 모듈이라 main.js 가 다른 파일을 import 로 불러오는데, import 주소에는 ?v= 가 붙지 않는다.
// 그래서 importmap 에 모든 모듈 파일을 ?v= 붙은 주소로 적어 둔다. 목록은 js/ 와 app/ 의 .js 를 훑어 만든다 (순서는 상관없다).
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PAGE = path.join(ROOT, 'app/index.html');
const SKIP = ['js/pedal-debug.js']; // 센서 디버그 페이지 전용

function jsFiles(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = `${dir}/${d.name}`;
    if (d.isDirectory()) return d.name === 'vendor' ? [] : jsFiles(rel); // vendor/ 는 모듈이 아닌 보통 스크립트
    return d.name.endsWith('.js') && !SKIP.includes(rel) ? [rel] : [];
  });
}

let html = fs.readFileSync(PAGE, 'utf8');
const eol = html.includes('\r\n') ? '\r\n' : '\n';

// 새 값: 오늘 날짜. 오늘 이미 올렸으면 끝 글자를 b, c … 로 올린다 (20261110 → 20261110b → 20261110c)
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const old = (html.match(/\?v=(\w+)/) || [])[1] || '';
let v = process.argv[2] || today;
if (!/^\w+$/.test(v)) throw new Error(`?v= 값은 영문·숫자만: ${v}`);
if (!process.argv[2] && old.startsWith(today)) {
  const tail = old.slice(today.length);
  v = today + (tail ? String.fromCharCode(tail.charCodeAt(0) + 1) : 'b');
}
html = html.replace(/\?v=\w+/g, `?v=${v}`);

// importmap: app/index.html 기준 주소 → 같은 주소 + ?v=
const files = [...jsFiles('js'), ...jsFiles('app')].sort();
const entries = files.map((f) => {
  const rel = path.posix.relative('app', f);
  const key = rel.startsWith('.') ? rel : `./${rel}`;
  return `      "${key}": "${key}?v=${v}"`;
});
const map = [
  '<script type="importmap">',
  '  {',
  '    "imports": {',
  entries.join(',' + eol),
  '    }',
  '  }',
  '  </script>',
].join(eol);
const re = /<script type="importmap">[\s\S]*?<\/script>/;
if (!re.test(html)) throw new Error('app/index.html 에 <script type="importmap"> 이 없습니다');
html = html.replace(re, map);

fs.writeFileSync(PAGE, html);
console.log(`app/index.html: ?v=${v}, importmap ${files.length}개 파일`);
