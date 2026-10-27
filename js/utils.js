// 여러 모듈이 같이 쓰는 작은 도우미 함수 모음
const U = (() => {
  const DAY = 24 * 60 * 60 * 1000;
  const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
  let counter = 0;

  return {
    // HTML에 사용자 입력을 넣을 때 반드시 거치기 (태그 깨짐/주입 방지)
    esc(str) {
      return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
      }[c]));
    },

    // 겹치지 않는 짧은 id
    uid() {
      counter += 1;
      return Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 6);
    },

    // 'YYYY-MM-DD' → Date (시간대 문제를 피하려고 로컬 자정으로 만든다)
    parseDate(str) {
      const [y, m, d] = String(str).split('-').map(Number);
      return new Date(y, m - 1, d);
    },

    // Date → 'YYYY-MM-DD'
    fmtDate(date) {
      const p = (n) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
    },

    today() {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    },

    addDays(date, n) {
      const d = new Date(date);
      d.setDate(d.getDate() + n);
      return d;
    },

    // a에서 b까지 며칠 (b가 미래면 양수)
    diffDays(a, b) {
      return Math.round((b - a) / DAY);
    },

    // 남은 일수 → 'D-12', 'D-Day', 'D+3'
    ddayLabel(n) {
      if (n > 0) return `D-${n}`;
      if (n === 0) return 'D-Day';
      return `D+${-n}`;
    },

    // '12월 11일 (금)'
    prettyDate(date, withYear = false) {
      const y = withYear ? `${date.getFullYear()}년 ` : '';
      return `${y}${date.getMonth() + 1}월 ${date.getDate()}일 (${WEEKDAYS[date.getDay()]})`;
    },

    // '화'
    weekdayName(date) {
      return WEEKDAYS[date.getDay()];
    },

    // '10/26'
    shortDate(date) {
      return `${date.getMonth() + 1}/${date.getDate()}`;
    },

    // 그 날이 속한 주의 월요일
    weekStart(date) {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      return U.addDays(d, -((d.getDay() + 6) % 7));
    },

    // 월요일부터 7일치 'YYYY-MM-DD' 목록
    weekDates(monday) {
      return Array.from({ length: 7 }, (_, i) => U.fmtDate(U.addDays(monday, i)));
    },

    // ----- 월 단위 ('YYYY-MM') -----
    monthKey(date) {
      return U.fmtDate(date).slice(0, 7);
    },

    addMonths(key, n) {
      const [y, m] = key.split('-').map(Number);
      return U.monthKey(new Date(y, m - 1 + n, 1));
    },

    daysInMonth(key) {
      const [y, m] = key.split('-').map(Number);
      return new Date(y, m, 0).getDate();
    },

    // '2026년 12월'
    prettyMonth(key) {
      const [y, m] = key.split('-').map(Number);
      return `${y}년 ${m}월`;
    },

    won(n) {
      return `${Math.round(n || 0).toLocaleString('ko-KR')}원`;
    },

    // '12,000' 같은 글자 → 12000
    parseWon(str) {
      return parseInt(String(str).replace(/[^\d]/g, ''), 10) || 0;
    },

    // 금액 입력칸에 쓰면 입력하는 동안 자동으로 쉼표가 찍힌다
    bindMoneyInput(input) {
      input.addEventListener('input', () => {
        const n = U.parseWon(input.value);
        input.value = n ? n.toLocaleString('ko-KR') : '';
      });
    },

    sum(list, pick) {
      return list.reduce((acc, x) => acc + (Number(pick(x)) || 0), 0);
    },
  };
})();
