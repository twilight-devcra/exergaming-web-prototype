// 회원 카드 그림: 만들기와 휴대폰에 저장하기. 회원 카드 화면(app/card.html)과, 휴대폰으로 운동한 판의 결과 화면(app/members.js)이 함께 쓴다.
// 전역 qrcode(app/vendor/qrcode.js)가 먼저 불려 있어야 한다. 로고(logo.svg)는 부르는 문서 기준 주소다 (둘 다 app/ 에 있다).
// 회원 카드 그림 (1080 × 1440 PNG). 저장해 두고 태블릿 카메라에 보여 주는 그림이라 QR 을 크게, 회원 번호만 담는다:
// 태블릿은 번호만 있으면 되고(app/members.js Members.parse), 내용이 짧으면 QR 칸이 21 × 21 로 굵어져 멀리서·작게 보여도 잘 읽힌다.
// 둘레 여백은 표준대로 4칸 (사진 속 어두운 배경과 붙지 않게)
export async function drawCard(id) {
  const W = 1080, H = 1440;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const text = '"IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const num = 'Nunito, ' + text;
  try {
    await Promise.all([document.fonts.load(`700 60px ${text}`), document.fonts.load(`900 120px ${num}`)]);
  } catch (e) { }
  const logo = await new Promise((res) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = 'logo.svg';
  });
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  // 머리: 로고와 이름
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  g.font = `700 64px ${text}`;
  const name = '두뇌 ';
  const nw = g.measureText(name).width;
  g.font = `900 64px ${num}`;
  const pw = g.measureText('PT').width;
  const lw = logo ? 92 : 0;
  let x = (W - (lw + (logo ? 22 : 0) + nw + pw)) / 2;
  if (logo) g.drawImage(logo, x, 70, lw, lw);
  x += lw + (logo ? 22 : 0);
  g.fillStyle = '#1d2b24';
  g.font = `700 64px ${text}`;
  g.fillText(name, x, 118);
  g.fillStyle = '#15803d';
  g.font = `900 64px ${num}`;
  g.fillText('PT', x + nw, 118);
  g.textAlign = 'center';
  g.fillStyle = '#4a5a52';
  g.font = `500 40px ${text}`;
  g.fillText('나의 회원 카드', W / 2, 220);
  // QR (회원 번호만)
  const qr = qrcode(0, 'M');
  qr.addData(id);
  qr.make();
  const n = qr.getModuleCount();
  const quiet = 4;
  const size = 780;
  const cell = Math.floor(size / (n + quiet * 2));
  const qs = cell * (n + quiet * 2);
  const qx = (W - qs) / 2, qy = 290;
  g.fillStyle = '#ffffff';
  g.fillRect(qx, qy, qs, qs);
  g.fillStyle = '#111111';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) g.fillRect(qx + (c + quiet) * cell, qy + (r + quiet) * cell, cell, cell);
  // 회원 번호
  g.fillStyle = '#1d2b24';
  g.font = `900 120px ${num}`;
  g.fillText(`${id.slice(0, 4)} ${id.slice(4)}`, W / 2, qy + qs + 90);
  g.fillStyle = '#4a5a52';
  g.font = `500 36px ${text}`;
  g.fillText('회원 번호', W / 2, qy + qs + 175);
  // 쓰는 법
  g.fillStyle = '#2563eb';
  g.font = `700 40px ${text}`;
  g.fillText('운동하러 오시면 이 사진을', W / 2, H - 150);
  g.fillText('태블릿 카메라에 보여 주세요', W / 2, H - 92);
  return new Promise((res) => cv.toBlob(res, 'image/png'));
}

// 갤러리에 저장: iPhone 은 공유 창의 '이미지 저장'으로 사진 앱에, 그 밖(안드로이드 등)은 내려받기로 (갤러리의 '다운로드' 앨범에 보인다).
// 내려받기를 막는 앱 안 브라우저도 있어 그림을 길게 눌러 저장하는 길도 안내한다
export async function saveCard(blob, id) {
  const fileName = `두뇌PT-회원카드-${id}.png`;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios && navigator.canShare) {
    const file = new File([blob], fileName, { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: '두뇌 PT 회원 카드' });
        return '공유 창에서 \'이미지 저장\'을 고르면 사진 앱에 저장돼요';
      } catch (e) {
        if (e.name === 'AbortError') return '';
      }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return '저장했어요! 갤러리(사진)의 \'다운로드\'에서 찾을 수 있어요';
}
