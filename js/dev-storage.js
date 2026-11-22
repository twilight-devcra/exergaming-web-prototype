// 시험용 배포(dev 브랜치, 주소에 /dev/ 가 들어간다)는 운영본과 같은 사이트 주소라 브라우저 저장소를 함께 쓴다.
// 그래서 시험용에서는 localStorage 키와 IndexedDB 이름 앞에 'dev:' 를 붙여, 운영본의 회원·기록·운영 설정·세션 로그와
// 절대 섞이지 않게 한다. 저장소를 여기서 한 번 감싸므로 다른 코드는 평소처럼 localStorage·indexedDB 를 쓰면 된다.
// js/config.js 가 맨 먼저 불러오므로, 다른 어떤 코드보다 먼저 적용된다. 운영본과 로컬 서버(localhost)에서는 아무것도 하지 않는다
export const DEV_BUILD = /\/dev\//.test(location.pathname);

if (DEV_BUILD) {
  const PREFIX = 'dev:';
  const wrap = (prototype, methodNames) => {
    for (const methodName of methodNames) {
      const original = prototype[methodName];
      prototype[methodName] = function (name, ...rest) {
        return original.call(this, PREFIX + name, ...rest);
      };
    }
  };
  wrap(Storage.prototype, ['getItem', 'setItem', 'removeItem']);
  wrap(IDBFactory.prototype, ['open', 'deleteDatabase']);
}
