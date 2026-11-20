// QR 코드 그리기와 읽기 (회원 카드). 그리기는 app/vendor/qrcode.js (index.html 이 보통 스크립트로 불러 둔다),
// 읽기는 카메라 또는 사진에서.

// text 를 담은 QR 코드 svg
export function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

// ---------------- 카메라로 QR 읽기 ----------------
// 브라우저가 BarcodeDetector 를 지원하면(안드로이드 Chrome 등) 그것으로, 아니면 app/vendor/jsQR.js 를 불러와 읽는다
export const QrScanner = {
  stream: null,
  timer: null,
  on: false,

  async start(video, onText, onState) {
    this.stop();
    this.on = true;
    onState('starting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (e) {
      this.on = false;
      onState('denied', e);
      return;
    }
    if (!this.on) return this.stop(); // 그 사이 화면을 떠났다
    video.srcObject = this.stream;
    try { await video.play(); } catch (e) { }
    let detect = null;
    if ('BarcodeDetector' in window) {
      try {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) {
          const d = new BarcodeDetector({ formats: ['qr_code'] });
          detect = async () => (await d.detect(video)).map((c) => c.rawValue);
        }
      } catch (e) { }
    }
    if (!detect) {
      await this.loadJsQR();
      const cv = document.createElement('canvas');
      const g = cv.getContext('2d', { willReadFrequently: true });
      detect = async () => {
        const w = 640;
        const h = Math.round((video.videoHeight / (video.videoWidth || 1)) * w) || 360;
        cv.width = w;
        cv.height = h;
        g.drawImage(video, 0, 0, w, h);
        const r = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
        return r ? [r.data] : [];
      };
    }
    onState('ready');
    const loop = async () => {
      if (!this.on) return;
      try {
        if (video.readyState >= 2) for (const t of await detect()) onText(t);
      } catch (e) { }
      if (this.on) this.timer = setTimeout(loop, 200);
    };
    loop();
  },

  // 사진 파일 하나에서 QR 내용을 읽는다 (없으면 null). 회원 카드 그림은 QR 이 크지만, 결과 화면을 캡처한 사진처럼 작은 QR 도
  // 읽히도록 jsQR 은 두 크기로 해 본다 (너무 큰 사진은 jsQR 이 느리고, 너무 줄이면 작은 QR 이 뭉개진다)
  async readImage(file) {
    const bmp = await createImageBitmap(file);
    try {
      if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
        const found = await new BarcodeDetector({ formats: ['qr_code'] }).detect(bmp);
        if (found.length) return found[0].rawValue;
      }
    } catch (e) { }
    await this.loadJsQR();
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d', { willReadFrequently: true });
    for (const side of [1600, 800]) {
      const k = Math.min(1, side / Math.max(bmp.width, bmp.height));
      cv.width = Math.round(bmp.width * k);
      cv.height = Math.round(bmp.height * k);
      g.drawImage(bmp, 0, 0, cv.width, cv.height);
      const r = jsQR(g.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height, { inversionAttempts: 'attemptBoth' });
      if (r) return r.data;
    }
    return null;
  },

  loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'vendor/jsQR.js';
      s.onload = res;
      s.onerror = rej;
      document.head.append(s);
    });
  },

  stop() {
    this.on = false;
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
  },
};
