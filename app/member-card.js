// 회원 카드 그림: 만들기와 휴대폰에 저장하기. 회원 카드 화면(app/card.html)과, 휴대폰으로 운동한 판의 결과 화면(app/members.js)이 함께 쓴다.
// 전역 qrcode(app/vendor/qrcode.js)가 먼저 불려 있어야 한다. 로고(logo.svg)는 부르는 문서 기준 주소다 (둘 다 app/ 에 있다).
// 회원 카드 그림 (1080 × 1440 PNG). 저장해 두고 태블릿 카메라에 보여 주는 그림이라 QR 을 크게, 회원 번호만 담는다:
// 태블릿은 번호만 있으면 되고(app/member-records.js Members.parse), 내용이 짧으면 QR 칸이 21 × 21 로 굵어져 멀리서·작게 보여도 잘 읽힌다.
// 둘레 여백은 표준대로 4칸 (사진 속 어두운 배경과 붙지 않게)
export async function drawCard(id) {
  const cardWidth = 1080, cardHeight = 1440;
  const canvas = document.createElement('canvas');
  canvas.width = cardWidth;
  canvas.height = cardHeight;
  const context = canvas.getContext('2d');
  const textFont = '"IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
  const numberFont = 'Nunito, ' + textFont;
  try {
    await Promise.all([document.fonts.load(`700 60px ${textFont}`), document.fonts.load(`900 120px ${numberFont}`)]);
  } catch { }
  const logo = await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = 'logo.svg';
  });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, cardWidth, cardHeight);
  // 머리: 로고와 이름
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.font = `700 64px ${textFont}`;
  const name = '두뇌 ';
  const nameWidth = context.measureText(name).width;
  context.font = `900 64px ${numberFont}`;
  const ptWidth = context.measureText('PT').width;
  const logoSize = logo ? 92 : 0;
  let x = (cardWidth - (logoSize + (logo ? 22 : 0) + nameWidth + ptWidth)) / 2;
  if (logo) context.drawImage(logo, x, 70, logoSize, logoSize);
  x += logoSize + (logo ? 22 : 0);
  context.fillStyle = '#1d2b24';
  context.font = `700 64px ${textFont}`;
  context.fillText(name, x, 118);
  context.fillStyle = '#15803d';
  context.font = `900 64px ${numberFont}`;
  context.fillText('PT', x + nameWidth, 118);
  context.textAlign = 'center';
  context.fillStyle = '#4a5a52';
  context.font = `500 40px ${textFont}`;
  context.fillText('나의 회원 카드', cardWidth / 2, 220);
  // QR (회원 번호만)
  const qrCode = qrcode(0, 'M');
  qrCode.addData(id);
  qrCode.make();
  const moduleCount = qrCode.getModuleCount();
  const quiet = 4;
  const size = 780;
  const cell = Math.floor(size / (moduleCount + quiet * 2));
  const qrSize = cell * (moduleCount + quiet * 2);
  const qrX = (cardWidth - qrSize) / 2, qrY = 290;
  context.fillStyle = '#ffffff';
  context.fillRect(qrX, qrY, qrSize, qrSize);
  context.fillStyle = '#111111';
  for (let row = 0; row < moduleCount; row++) {
    for (let column = 0; column < moduleCount; column++) {
      if (qrCode.isDark(row, column)) context.fillRect(qrX + (column + quiet) * cell, qrY + (row + quiet) * cell, cell, cell);
    }
  }
  // 회원 번호
  context.fillStyle = '#1d2b24';
  context.font = `900 120px ${numberFont}`;
  context.fillText(`${id.slice(0, 4)} ${id.slice(4)}`, cardWidth / 2, qrY + qrSize + 90);
  context.fillStyle = '#4a5a52';
  context.font = `500 36px ${textFont}`;
  context.fillText('회원 번호', cardWidth / 2, qrY + qrSize + 175);
  // 쓰는 법
  context.fillStyle = '#2563eb';
  context.font = `700 40px ${textFont}`;
  context.fillText('운동하러 오시면 이 사진을', cardWidth / 2, cardHeight - 150);
  context.fillText('태블릿 카메라에 보여 주세요', cardWidth / 2, cardHeight - 92);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
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
      } catch (error) {
        if (error.name === 'AbortError') return '';
      }
    }
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
  return '저장했어요! 갤러리(사진)의 \'다운로드\'에서 찾을 수 있어요';
}
