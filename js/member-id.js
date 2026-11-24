// 글 아이디 규칙 (운영 버전 회원). 서버(api/server.js, require)와 태블릿(app/member-records.js, import)이 이 파일 하나를 함께 쓴다.
//
// 회원을 가리키는 값(세션 로그의 meta.user, 회원 기록 ?user=)은 두 가지다
//  - 회원 번호: 8자리 숫자 (QR 회원 카드, app/member-records.js Members.valid)
//  - 글 아이디: '<시설 접두어>_<아이디>'. 담당자가 '새 아이디 만들기'로 적은 글이 아이디이고, 운영 메뉴의 '아이디 접두어'가 앞에 붙는다.
//    여러 시설이 한 서버를 써도 같은 아이디가 겹치지 않게 하려는 것이다. 화면에는 아이디만 보인다
//  접두어에는 '_' 가 없으므로 첫 '_' 앞이 접두어, 뒤가 아이디다. 회원 번호에는 '_' 가 없어 둘이 섞이지 않는다
//
// 같은 아이디인지는 영문 대소문자를 가리지 않고 본다 (Kim 과 kim 은 같은 아이디). 서버의 users 표도 COLLATE NOCASE 다
// 의존성 없음 (서버가 require 로 읽으므로 다른 모듈을 import 하지 않는다)

export const MemberId = {
  PREFIX_MAX: 16,
  NAME_MAX: 12,
  // 접두어: 한글 완성 글자 · 영문 소문자 · 숫자 · '-' (예: 강남, gangnam, 강남-2관). '_' 는 접두어와 아이디를 가르므로 쓰지 않는다
  PREFIX_PATTERN: /^[가-힣a-z0-9-]{1,16}$/,
  NAME_PATTERN: /^[가-힣A-Za-z0-9]{1,12}$/,
  FULL_PATTERN: /^[가-힣a-z0-9-]{1,16}_[가-힣A-Za-z0-9]{1,12}$/,

  // 운영 메뉴에 적은 접두어를 고른 꼴로 (한글 조합을 한 글자로 모으고, 앞뒤 빈칸 빼고, 영문은 소문자로)
  cleanPrefix(text) {
    return String(text ?? '').normalize('NFC').trim().toLowerCase();
  },

  validPrefix(prefix) {
    return this.PREFIX_PATTERN.test(prefix);
  },

  // 접두어로 쓸 수 없으면 그 까닭 (운영 메뉴에 그대로 보인다), 쓸 수 있으면 null. 빈 접두어는 '없음' 이라 여기서 따지지 않는다
  prefixProblem(prefix) {
    if (!prefix || this.validPrefix(prefix)) return null;
    if (/\s/.test(prefix)) return '띄어쓰기 없이 적어 주세요.';
    if (/[ㄱ-ㅎㅏ-ㅣ]/.test(prefix)) return '글자를 끝까지 적어 주세요 (ㄱ, ㅏ 처럼 낱자만 있으면 안 됩니다).';
    if (prefix.includes('_')) return "'_' 는 쓸 수 없습니다 ('-' 는 됩니다).";
    if (prefix.length > this.PREFIX_MAX) return `${this.PREFIX_MAX}자까지 쓸 수 있습니다.`;
    return '한글 · 영문 소문자 · 숫자 · - 만 쓸 수 있습니다.';
  },

  // 적은 아이디를 고른 꼴로 (한글 조합을 한 글자로 모으고 앞뒤 빈칸을 뺀다)
  cleanName(text) {
    return String(text ?? '').normalize('NFC').trim();
  },

  // 아이디로 쓸 수 없으면 그 까닭 (화면에 그대로 보인다), 쓸 수 있으면 null
  nameProblem(name) {
    if (!name) return '아이디를 적어 주세요';
    if (/\s/.test(name)) return '띄어쓰기 없이 적어 주세요';
    if (/[ㄱ-ㅎㅏ-ㅣ]/.test(name)) return '글자를 끝까지 적어 주세요 (ㄱ, ㅏ 처럼 낱자만 있으면 안 돼요)';
    if (!/^[가-힣A-Za-z0-9]*$/.test(name)) return '한글 · 영문 · 숫자만 쓸 수 있어요';
    if (name.length > this.NAME_MAX) return `${this.NAME_MAX}자까지 쓸 수 있어요`;
    return null;
  },

  make(prefix, name) {
    return `${prefix}_${name}`;
  },

  // 글 아이디인가 (접두어까지 붙은 꼴)
  isNamed(id) {
    return typeof id === 'string' && this.FULL_PATTERN.test(id);
  },

  prefixOf(id) {
    return id.slice(0, id.indexOf('_'));
  },

  nameOf(id) {
    return id.slice(id.indexOf('_') + 1);
  },

  // 같은 아이디인지 견줄 때 쓰는 열쇠 (영문 대소문자를 가리지 않는다)
  keyOf(id) {
    return String(id).toLowerCase();
  },
};
