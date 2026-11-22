// 테스트 화면(index.html)의 결과 화면과 순위표. 운영 버전(app/)은 js/demo.js 의 스테이션 결과 화면을 쓴다.
// 순위는 이 기기의 localStorage 에만 남는다 (exergame.board, 위에서 50개)
import { $, Util } from './config.js';
import { Effects } from './fx.js';
import { GAME_TYPES } from './games/index.js';
import { RoundReport } from './round-report.js';

const BOARD_KEY = 'exergame.board';

export const TestResults = {
  app: null,
  savedId: null, // 이번 결과를 순위에 올렸으면 그 기록의 id (순위표에서 강조, 두 번 올리지 않게)

  bind(app) {
    this.app = app;
    // 세션 성과·운동량 카드를 점수와 순위 사이에 붙인다
    $('#result .rp-slot').replaceWith(RoundReport.card());
    $('#btn-again').onclick = () => app.startRound();
    $('#btn-menu').onclick = () => app.show('menu');
    $('#btn-save').onclick = () => this.saveScore();
    $('#btn-log').onclick = () => {
      if (!app.log) return;
      app.log.download();
      $('#btn-log').textContent = '저장됨 · 다시 저장';
    };
    $('#res-name').addEventListener('keydown', (event) => { if (event.key === 'Enter') this.saveScore(); });
    this.renderBoard($('#menu-board'));
  },

  show() {
    const app = this.app;
    const { config } = app;
    const exerciseMax = Math.floor(config.durationSec / config.tickSec) * config.tickMaxPoints;
    $('#res-total').textContent = app.score;
    $('#res-ex').textContent = app.brainOnly ? '–' : app.exScore;
    $('#res-ex-sub').textContent = app.brainOnly ? ' 페달 없이 (두뇌 게임만)' : ` / ${exerciseMax}`;
    $('#res-cog').textContent = app.cogScore;
    // 이번 라운드에 실제로 나온 게임만 적는다
    // 게임마다 한 줄 (이름 · 판 수 · 정답 · 점수). 줄바꿈 없이 표로 맞춰 11종이 다 나와도 카드에 들어간다
    const games = app.roundStats.games;
    const rows = GAME_TYPES.filter((gameType) => games[gameType.id].plays).map((gameType) => {
      const game = games[gameType.id];
      return `<span class="g">${gameType.title}</span><span>${game.plays}회</span><span>${game.correct}/${game.total}</span><span>${game.points}점</span>`;
    });
    const { bestStreak } = app.roundStats;
    const streak = bestStreak >= 2 ? `<b>최고 연속 정답 ${bestStreak}회</b>` : '';
    $('#res-cog-sub').innerHTML = `<div class="rs-table">${rows.join('')}</div>${streak}`;
    $('#save-row').style.display = '';
    $('#btn-log').disabled = false;
    $('#btn-log').textContent = '세션 로그 저장';
    $('#res-name').value = '';
    this.savedId = null;
    this.renderBoard($('#res-board'));
    RoundReport.fill(app, $('#result'));
    app.show('result');
    Effects.confetti(1);
    // 터치 화면(휴대폰·태블릿)에서는 바로 자판이 올라와 결과를 가리므로 눌렀을 때만 넣는다
    if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => $('#res-name').focus(), 50);
  },

  loadBoard() {
    try { return JSON.parse(localStorage.getItem(BOARD_KEY) || '[]'); } catch { return []; }
  },

  saveScore() {
    if (this.savedId) return;
    const app = this.app;
    const name = $('#res-name').value.trim() || '이름없음';
    const board = this.loadBoard();
    this.savedId = Date.now();
    // eslint-disable-next-line id-length -- 저장된 기록 형식 (ex)
    board.push({ id: this.savedId, name, score: app.score, ex: app.exScore, cog: app.cogScore, dur: app.config.durationSec, track: app.brainOnly ? 'brain' : 'dual' });
    board.sort((a, b) => b.score - a.score);
    try { localStorage.setItem(BOARD_KEY, JSON.stringify(board.slice(0, 50))); } catch { /* 저장 못 해도 넘어간다 */ }
    $('#save-row').style.display = 'none';
    this.renderBoard($('#res-board'));
  },

  renderBoard(list) {
    const board = this.loadBoard().slice(0, 8);
    if (!board.length) {
      list.innerHTML = '<li class="board-empty">아직 기록이 없습니다</li>';
      return;
    }
    list.innerHTML = board.map((entry, i) => `
      <li class="${entry.id === this.savedId ? 'me' : ''}">
        <span class="rank">${i + 1}</span>
        <span class="name">${entry.name.replace(/[<>&]/g, '')}</span>
        <span>${entry.score}점 <small style="color:var(--ink-soft)">(${Util.formatTime(entry.dur)}${entry.track === 'brain' ? ' · 두뇌만' : ''})</small></span>
      </li>`).join('');
  },
};
