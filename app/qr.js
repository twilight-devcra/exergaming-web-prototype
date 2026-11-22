// QR 코드 그리기와 읽기 (회원 카드). 그리기는 app/vendor/qrcode.js (index.html 이 보통 스크립트로 불러 둔다),
// 읽기는 카메라 또는 사진에서.

// text 를 담은 QR 코드 svg
export function qrSvg(text) {
  const qrCode = qrcode(0, 'M');
  qrCode.addData(text);
  qrCode.make();
  return qrCode.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

// ---------------- 카메라로 QR 읽기 ----------------
// 브라우저가 BarcodeDetector 를 지원하면(안드로이드 Chrome 등) 그것으로, 아니면 app/vendor/jsQR.js 를 불러와 읽는다
export const QrScanner = {
  stream: null,
  timer: null,
  running: false,

  async start(video, onText, onState) {
    this.stop();
    this.running = true;
    onState('starting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    } catch (error) {
      this.running = false;
      onState('denied', error);
      return;
    }
    if (!this.running) return this.stop(); // 그 사이 화면을 떠났다
    video.srcObject = this.stream;
    try { await video.play(); } catch { }
    let detect = null;
    if ('BarcodeDetector' in window) {
      try {
        const formats = await BarcodeDetector.getSupportedFormats();
        if (formats.includes('qr_code')) {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          detect = async () => (await detector.detect(video)).map((code) => code.rawValue);
        }
      } catch { }
    }
    if (!detect) {
      await this.loadJsQR();
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      detect = async () => {
        const frameWidth = 640;
        const frameHeight = Math.round((video.videoHeight / (video.videoWidth || 1)) * frameWidth) || 360;
        canvas.width = frameWidth;
        canvas.height = frameHeight;
        context.drawImage(video, 0, 0, frameWidth, frameHeight);
        const found = jsQR(context.getImageData(0, 0, frameWidth, frameHeight).data, frameWidth, frameHeight, { inversionAttempts: 'attemptBoth' });
        return found ? [found.data] : [];
      };
    }
    onState('ready');
    const loop = async () => {
      if (!this.running) return;
      try {
        if (video.readyState >= 2) for (const text of await detect()) onText(text);
      } catch { }
      if (this.running) this.timer = setTimeout(loop, 200);
    };
    loop();
  },

  // 사진 파일 하나에서 QR 내용을 읽는다 (없으면 null). 회원 카드 그림은 QR 이 크지만, 결과 화면을 캡처한 사진처럼 작은 QR 도
  // 읽히도록 jsQR 은 두 크기로 해 본다 (너무 큰 사진은 jsQR 이 느리고, 너무 줄이면 작은 QR 이 뭉개진다)
  async readImage(file) {
    const bitmap = await createImageBitmap(file);
    try {
      if ('BarcodeDetector' in window && (await BarcodeDetector.getSupportedFormats()).includes('qr_code')) {
        const found = await new BarcodeDetector({ formats: ['qr_code'] }).detect(bitmap);
        if (found.length) return found[0].rawValue;
      }
    } catch { }
    await this.loadJsQR();
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });
    for (const side of [1600, 800]) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const found = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
      if (found) return found.data;
    }
    return null;
  },

  loadJsQR() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'vendor/jsQR.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
  },

  stop() {
    this.running = false;
    clearTimeout(this.timer);
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
  },
};
