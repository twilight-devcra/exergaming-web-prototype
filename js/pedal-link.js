// Cardio 페달 BLE 연결 (Web Bluetooth). CardioArcade 안드로이드 앱의 ble/Protocol.kt, PedalLink.kt를 옮긴 것이다.
// 페달은 Nordic UART(NUS)로 ASCII 프레임을 주고받는다: `NAME,<필드 수>:v1,v2,...;`
// 인자가 없는 명령도 `,0:`은 있어야 한다 (`VER,0:;`). 펌웨어 파서가 ','와 ':'를 모두 요구한다.
export const NUS = {
  SERVICE: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  RX_CHARACTERISTIC: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // 웹 → 페달 (write)
  TX_CHARACTERISTIC: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // 페달 → 웹 (notify)
  NAME_PREFIX: 'Cardio-P',                    // 광고 이름은 "Cardio-P 3A7F" 형태
  command: (name, values = []) => `${name},${values.length}:${values.join(',')};`,
};

export const FrameCodec = {
  // 끝의 ';'는 있어도 없어도 된다. 프레임이 아니면 null
  parse(text) {
    const comma = text.indexOf(',');
    const colon = text.indexOf(':');
    if (comma <= 0 || colon < 0 || comma > colon) return null;
    const data = text.slice(colon + 1).trim().replace(/;+$/, '');
    return {
      name: text.slice(0, comma).trim(),
      values: data.split(',').map((value) => value.trim()).filter((value) => value !== ''),
    };
  },

  // `WORKOUT,3:avg_rpm,watt,rev_count;` — 연결되어 있는 동안 페달이 약 1초마다 보낸다
  workout(frame) {
    if (frame.name !== 'WORKOUT' || frame.values.length !== 3) return null;
    if (!frame.values.every((value) => /^-?\d+$/.test(value))) return null;
    const [rpm, watt, revCount] = frame.values.map(Number);
    return { rpm, watt, revCount };
  },
};

// 알림 하나에 프레임 하나가 온다는 보장이 없으므로 ';' 기준으로 직접 자른다.
class FrameSplitter {
  constructor(maxBuffer = 2048) {
    this.maxBuffer = maxBuffer;
    this.buffer = '';
  }

  feed(chunk) {
    this.buffer += chunk;
    const out = [];
    let end;
    while ((end = this.buffer.indexOf(';')) >= 0) {
      const frame = this.buffer.slice(0, end).trim();
      this.buffer = this.buffer.slice(end + 1);
      if (frame) out.push(frame);
    }
    // ';'가 유실되어도 버퍼가 끝없이 커지지 않게 한다
    if (this.buffer.length > this.maxBuffer) this.buffer = '';
    return out;
  }

  reset() {
    this.buffer = '';
  }
}

// 페달 하나와의 BLE 연결.
// 안드로이드 앱과 달리 스캔 목록·본딩·MTU는 다루지 않는다. Web Bluetooth에서는 기기 선택 창과 OS가 맡는다.
export class PedalLink {
  constructor() {
    this.state = 'idle'; // idle | connecting | reconnecting | ready | disconnected
    this.detail = '';
    this.device = null;
    this.firmware = '';
    this.wantLink = false; // 사용자가 연결을 원하는 상태. 끊기면 자동으로 다시 붙는다
    this.onState = null;   // (state, detail)
    this.onWorkout = null; // ({ rpm, watt, revCount })
    this.onRaw = null;     // (text) 알림 하나를 디코딩한 그대로. 디버그 페이지용
    this.onFrame = null;   // (raw, frame|null) ';'로 자른 프레임 하나와 파싱 결과. 디버그 페이지용
    this.rxCharacteristic = null;
    this.splitter = new FrameSplitter();
    this.decoder = new TextDecoder();
    this.epoch = 0;        // 바뀌면 진행 중이던 이전 연결 시도의 결과는 무시된다
    this.retries = 0;
    this.retryTimer = null;
    this.connectedAt = 0;
    this.writeChain = Promise.resolve();
    this.handleGone = () => this.lost('페달과의 연결이 끊어졌습니다');
    this.handleNotify = (event) => this.notify(event.target.value);
  }

  get supported() {
    return !!navigator.bluetooth;
  }

  // 기기 선택 창을 띄우므로 클릭 같은 사용자 동작 안에서 호출해야 한다
  async connect() {
    if (!this.supported) {
      this.setState('idle', 'Web Bluetooth를 쓸 수 없습니다 (Chrome·Edge에서 localhost로 열어주세요)');
      return;
    }
    let device;
    try {
      device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: NUS.NAME_PREFIX }],
        optionalServices: [NUS.SERVICE],
      });
    } catch (error) {
      // 선택 창을 그냥 닫은 경우(NotFoundError)는 오류가 아니다
      if (error.name !== 'NotFoundError') this.setState(this.state, `페달을 찾지 못했습니다: ${error.message}`);
      return;
    }
    this.release();
    this.device = device;
    device.addEventListener('gattserverdisconnected', this.handleGone);
    this.wantLink = true;
    this.retries = 0;
    await this.open();
  }

  async open() {
    const epoch = ++this.epoch;
    const { device } = this;
    if (this.state !== 'reconnecting') this.setState('connecting', '연결 중…');
    try {
      const server = await device.gatt.connect();
      this.connectedAt = performance.now();
      const service = await server.getPrimaryService(NUS.SERVICE);
      const txCharacteristic = await service.getCharacteristic(NUS.TX_CHARACTERISTIC);
      const rxCharacteristic = await service.getCharacteristic(NUS.RX_CHARACTERISTIC);
      txCharacteristic.addEventListener('characteristicvaluechanged', this.handleNotify);
      await txCharacteristic.startNotifications();
      if (epoch !== this.epoch) return;
      this.rxCharacteristic = rxCharacteristic;
      this.splitter.reset();
      this.setState('ready', `${device.name || '페달'} 연결됨`);
      this.send(NUS.command('VER')).catch(() => {});
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (device.gatt.connected) device.gatt.disconnect();
      this.lost(`연결 실패: ${error.message}`);
    }
  }

  // 연결이 끊겼거나 연결 시도가 실패했을 때. 사용자가 끊은 게 아니면 몇 번 다시 시도한다.
  lost(message) {
    if (this.retryTimer) return;
    this.rxCharacteristic = null;
    const lived = this.connectedAt ? performance.now() - this.connectedAt : -1;
    this.connectedAt = 0;
    if (!this.wantLink) {
      this.setState('disconnected', '연결 해제됨');
      return;
    }
    // 한동안 유지되던 연결이 끊긴 것이면 재시도 횟수를 새로 센다
    if (lived >= PedalLink.SHORT_LIVED_MS) this.retries = 0;
    if (this.retries >= PedalLink.MAX_RETRIES) {
      this.wantLink = false;
      // 페달은 연결 직후 보안(페어링)을 요청하고, 실패하면 몇 초 안에 연결을 끊는다.
      // 한쪽에만 페어링 키가 남아 있을 때 이렇게 반복된다.
      const hint = lived >= 0 ? ' 연결 직후 계속 끊긴다면 OS 블루투스 설정에서 페달을 제거한 뒤 다시 연결해 보세요.' : '';
      this.setState('disconnected', message + hint);
      return;
    }
    this.retries++;
    this.setState('reconnecting', `${message} · 다시 연결 중… (${this.retries}/${PedalLink.MAX_RETRIES})`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.open();
    }, 1500);
  }

  disconnect() {
    this.wantLink = false;
    this.release();
    this.setState('disconnected', '연결 해제됨');
  }

  // 현재 기기와의 연결과 예약된 재시도를 모두 정리한다
  release() {
    this.epoch++;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.rxCharacteristic = null;
    this.connectedAt = 0;
    const device = this.device;
    if (!device) return;
    device.removeEventListener('gattserverdisconnected', this.handleGone);
    if (device.gatt.connected) device.gatt.disconnect();
  }

  // 쓰기는 하나씩 차례로 보낸다. Web Bluetooth 는 GATT 쓰기가 겹치면 예외를 던진다.
  send(text) {
    const rxCharacteristic = this.rxCharacteristic;
    if (!rxCharacteristic) return Promise.reject(new Error('not connected'));
    const run = () => rxCharacteristic.writeValueWithResponse(new TextEncoder().encode(text));
    const sent = this.writeChain.then(run, run);
    this.writeChain = sent.catch(() => {});
    return sent;
  }

  notify(value) {
    if (this.state !== 'ready') return;
    const text = this.decoder.decode(value);
    if (this.onRaw) this.onRaw(text);
    for (const raw of this.splitter.feed(text)) {
      const frame = FrameCodec.parse(raw);
      if (this.onFrame) this.onFrame(raw, frame);
      if (!frame) continue;
      if (frame.name === 'VER') {
        this.firmware = frame.values.join(' ');
      } else if (frame.name === 'WORKOUT') {
        const workout = FrameCodec.workout(frame);
        if (workout && this.onWorkout) this.onWorkout(workout);
      }
    }
  }

  setState(state, detail) {
    this.state = state;
    this.detail = detail;
    if (this.onState) this.onState(state, detail);
  }
}

PedalLink.MAX_RETRIES = 5;
PedalLink.SHORT_LIVED_MS = 8000;
