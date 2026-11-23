// 운영 버전(app/index.html)의 파일 주소 끝 ?v= 를 새 값으로 바꾸고, 가져오기 지도(importmap)를 다시 만든다.
// GitHub Pages 에 올릴 때 .github/workflows/pages.yml 이 커밋 번호를 값으로 넣어 돌린다 (node tools/stamp.js <값>).
// 손으로 돌릴 일은 없다. 값 없이 돌리면 오늘 날짜를 쓴다 (새 모듈 파일을 더한 뒤 저장소의 지도를 맞춰 두고 싶을 때).
// 둘째 값(브랜치: main 또는 dev)을 주면 저장소의 VERSION(유의적 버전, 예: 1.2.0)을 읽어 두 버전 첫 화면 구석 표시(.build-tag)에 넣는다:
// main → 'v1.2.0', dev → 'v1.2.0-dev'. 스크립트가 아니라 HTML 글자라 모듈을 못 불러와도 보인다
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
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const relativePath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === 'vendor' ? [] : jsFiles(relativePath); // vendor/ 는 모듈이 아닌 보통 스크립트
    return entry.name.endsWith('.js') && !SKIP.includes(relativePath) ? [relativePath] : [];
  });
}

let html = fs.readFileSync(PAGE, 'utf8');
const lineEnd = html.includes('\r\n') ? '\r\n' : '\n';

// 새 값: 오늘 날짜. 오늘 이미 올렸으면 끝 글자를 b, c … 로 올린다 (20261110 → 20261110b → 20261110c)
const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const previous = (html.match(/\?v=(\w+)/) || [])[1] || '';
let version = process.argv[2] || today;
if (!/^\w+$/.test(version)) throw new Error(`?v= 값은 영문·숫자만: ${version}`);
if (!process.argv[2] && previous.startsWith(today)) {
  const tail = previous.slice(today.length);
  version = today + (tail ? String.fromCharCode(tail.charCodeAt(0) + 1) : 'b');
}
html = html.replace(/\?v=\w+/g, `?v=${version}`);

// importmap: app/index.html 기준 주소 → 같은 주소 + ?v=
const files = [...jsFiles('js'), ...jsFiles('app')].sort();
const entries = files.map((file) => {
  const relativePath = path.posix.relative('app', file);
  const key = relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
  return `      "${key}": "${key}?v=${version}"`;
});
const importmap = [
  '<script type="importmap">',
  '  {',
  '    "imports": {',
  entries.join(',' + lineEnd),
  '    }',
  '  }',
  '  </script>',
].join(lineEnd);
const importmapPattern = /<script type="importmap">[\s\S]*?<\/script>/;
if (!importmapPattern.test(html)) throw new Error('app/index.html 에 <script type="importmap"> 이 없습니다');
html = html.replace(importmapPattern, importmap);

fs.writeFileSync(PAGE, html);
console.log(`app/index.html: ?v=${version}, importmap ${files.length}개 파일`);

// 첫 화면의 버전 표시: 운영 버전(app/index.html)과 테스트 버전(index.html)
const branch = process.argv[3];
if (branch) {
  if (!['main', 'dev'].includes(branch)) throw new Error(`브랜치는 main 또는 dev: ${branch}`);
  const semver = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(semver)) throw new Error(`VERSION 은 1.2.3 꼴이어야 합니다: ${semver}`);
  const label = `v${semver}${branch === 'dev' ? '-dev' : ''}`;
  for (const page of [PAGE, path.join(ROOT, 'index.html')]) {
    const text = fs.readFileSync(page, 'utf8');
    const tagPattern = /(<span class="build-tag">)[^<]*(<\/span>)/;
    if (!tagPattern.test(text)) throw new Error(`${path.relative(ROOT, page)} 에 <span class="build-tag"> 이 없습니다`);
    fs.writeFileSync(page, text.replace(tagPattern, `$1${label}$2`));
  }
  console.log(`build-tag: ${label}`);
}
