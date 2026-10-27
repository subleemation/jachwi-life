// 통합 홈 화면
// 홈은 자기 데이터(오늘 할 일 메모)만 갖고, 나머지는 각 모듈이 api로 내준 정보를 모아서 보여준다.
//
// 모듈이 api에 넣을 수 있는 것 (모두 선택):
//   stat()       → { icon, label, value, sub, pct?, warn?, good?, href }   요약 타일 하나
//   deadlines()  → [{ key, icon, title, date: Date, source, href,
//                     checkable?, actionLabel?, complete?(onDone) }]       기한 있는 할 일들
//                  기한 지남·오늘 → '오늘 할 일', 내일 이후 → '다가오는 D-day'
//   widget(el)   (api 밖, 모듈에 직접) 홈 아래쪽에 그리는 자세한 카드
//
// 새 모듈에 위 함수만 만들어 두면 홈에 자동으로 합쳐진다.

(() => {
  const TODOS = 'home.todos';     // [{ id, title, date:'YYYY-MM-DD', done, doneAt }]

  function loadTodos() {
    // 끝낸 지 7일 넘은 메모는 정리
    const cutoff = U.fmtDate(U.addDays(U.today(), -7));
    const list = Store.get(TODOS, []);
    const kept = list.filter((t) => !t.done || t.doneAt >= cutoff);
    if (kept.length !== list.length) Store.set(TODOS, kept);
    return kept;
  }
  const saveTodos = (l) => Store.set(TODOS, l);

  // 모듈 하나가 고장 나도 홈 전체는 살아 있게
  function safe(fn, fallback) {
    try { return fn() ?? fallback; } catch (e) { console.error(e); return fallback; }
  }

  function collectDeadlines() {
    const today = U.today();
    return App.modules
      .flatMap((m) => safe(() => m.api?.deadlines?.(), []))
      .map((d) => ({ ...d, left: U.diffDays(today, d.date) }))
      .sort((a, b) => a.date - b.date);
  }

  function collectStats() {
    return App.modules.map((m) => safe(() => m.api?.stat?.(), null)).filter(Boolean);
  }

  function leftLabel(n) {
    if (n > 0) return `D-${n}`;
    if (n === 0) return '오늘';
    return `${-n}일 지남`;
  }
  const dueClass = (n) => (n < 0 ? 'due-overdue' : n <= 3 ? 'due-soon' : 'due-later');

  // ---------- 각 영역 ----------
  function heroHtml() {
    const now = new Date();
    const h = now.getHours();
    const greet = h < 5 ? '늦은 밤이에요, 얼른 자요 🌙' : h < 11 ? '좋은 아침이에요 ☀️' : h < 17 ? '오늘도 화이팅 💪' : '오늘 하루 수고했어요 🌆';
    const n = U.diffDays(U.today(), App.moveInDate());
    return `
      <section class="card hero hero-row">
        <div>
          <div class="label">${U.prettyDate(U.today(), true)}</div>
          <div class="greet">${App.settings().nickname ? `${U.esc(App.settings().nickname)}님, ` : ''}${greet}</div>
        </div>
        <div class="hero-dday">
          <div class="label">${n > 0 ? '입주까지' : n === 0 ? '오늘 입주!' : '자취'}</div>
          <div class="dday">${n > 0 ? `D-${n}` : n === 0 ? '🎉' : `${-n + 1}일째`}</div>
        </div>
      </section>`;
  }

  function tilesHtml(stats) {
    return `<div class="tiles">${stats.map((s) => `
      <a class="tile" href="${s.href}">
        <span class="tile-label">${s.icon} ${U.esc(s.label)}</span>
        <b class="tile-value ${s.warn ? 'neg' : ''}">${U.esc(s.value)}</b>
        ${typeof s.pct === 'number' ? `<span class="progress ${s.warn ? 'over' : s.good ? 'ok' : ''}"><span style="width:${Math.min(100, s.pct)}%"></span></span>` : ''}
        <span class="tile-sub">${U.esc(s.sub || '')}</span>
      </a>`).join('')}</div>`;
  }

  function todayHtml(due) {
    const todayStr = U.fmtDate(U.today());
    const todos = loadTodos()
      .filter((t) => (t.done ? t.doneAt === todayStr : t.date <= todayStr))
      .sort((a, b) => Number(a.done) - Number(b.done) || (a.date < b.date ? -1 : 1));

    const dueRows = due.map((d) => `
      <li class="check-item" data-dl="${U.esc(d.key)}">
        ${d.checkable ? `
          <label class="check" aria-label="완료 표시"><input type="checkbox" data-action="dl-check"><span class="checkmark"></span></label>` : `
          <span class="check" aria-hidden="true"><span class="row-icon">${d.icon}</span></span>`}
        <a class="check-body" href="${d.href}">
          <span class="check-title">${d.checkable ? `${d.icon} ` : ''}${U.esc(d.title)}</span>
          <span class="check-meta"><span class="due ${dueClass(d.left)}">${leftLabel(d.left)}</span><span>${U.esc(d.source)}</span></span>
        </a>
        ${!d.checkable && d.complete ? `<button type="button" class="row-btn" data-action="dl-do">${U.esc(d.actionLabel || '완료')}</button>` : ''}
      </li>`).join('');

    const todoRows = todos.map((t) => {
      const late = !t.done && t.date < todayStr ? U.diffDays(U.parseDate(t.date), U.today()) : 0;
      return `
        <li class="check-item ${t.done ? 'is-done' : ''}" data-todo="${t.id}">
          <label class="check" aria-label="완료 표시">
            <input type="checkbox" data-action="todo-check" ${t.done ? 'checked' : ''}><span class="checkmark"></span>
          </label>
          <div class="check-body" style="cursor:default">
            <span class="check-title">${U.esc(t.title)}</span>
            ${late ? `<span class="check-meta"><span class="due due-soon">${late}일 전부터</span></span>` : ''}
          </div>
          <button type="button" class="icon-btn" data-action="todo-del" aria-label="삭제" style="align-self:center;margin-right:6px">✕</button>
        </li>`;
    }).join('');

    const left = due.length + todos.filter((t) => !t.done).length;
    return `
      <section class="card">
        <div class="card-head"><h2>✅ 오늘 할 일</h2><span class="muted small">${left ? `${left}개 남음` : '다 했어요 🎉'}</span></div>
        <form class="inline-add" data-form="todo-add" style="margin:0">
          <input class="input" name="title" maxlength="50" placeholder="할 일 추가 (예: 택배 받기)" autocomplete="off">
          <button type="submit" class="btn">추가</button>
        </form>
        ${dueRows || todoRows ? `<ul class="checklist flat">${dueRows}${todoRows}</ul>` : ''}
      </section>`;
  }

  function upcomingHtml(list) {
    if (!list.length) {
      return `
        <section class="card">
          <div class="card-head"><h2>⏳ 다가오는 D-day</h2></div>
          <p class="muted small" style="margin:0">당분간 급한 일정이 없어요.</p>
        </section>`;
    }
    const [top, ...rest] = list;
    return `
      <section class="card">
        <div class="card-head"><h2>⏳ 가장 급한 D-day</h2></div>
        <a class="urgent" href="${top.href}">
          <span class="urgent-dday ${dueClass(top.left)}">${leftLabel(top.left)}</span>
          <span class="urgent-main">
            <b>${top.icon} ${U.esc(top.title)}</b>
            <span class="muted small">${U.prettyDate(top.date)} · ${U.esc(top.source)}</span>
          </span>
        </a>
        ${rest.length ? `<ul class="mini-list">${rest.slice(0, 5).map((d) => `
          <li><a href="${d.href}" class="mini-link"><span>${d.icon} ${U.esc(d.title)}</span>
          <span class="due ${dueClass(d.left)}">${leftLabel(d.left)} <span class="muted small">${U.shortDate(d.date)}</span></span></a></li>`).join('')}
        </ul>` : ''}
      </section>`;
  }

  // ---------- 그리기 ----------
  let deadlineMap = new Map();

  function paint(root) {
    const all = collectDeadlines();
    deadlineMap = new Map(all.map((d) => [d.key, d]));
    const due = all.filter((d) => d.left <= 0);
    const upcoming = all.filter((d) => d.left > 0 && d.left <= 60);

    root.innerHTML = `
      ${heroHtml()}
      ${tilesHtml(collectStats())}
      <div class="home-grid">
        <div>${todayHtml(due)}</div>
        <div>${upcomingHtml(upcoming)}</div>
      </div>
      <div class="home-grid" data-widgets></div>`;

    const box = root.querySelector('[data-widgets]');
    App.modules.filter((m) => m.widget).forEach((m) => {
      const slot = document.createElement('div');
      box.appendChild(slot);
      try {
        m.widget(slot);
      } catch (e) {
        console.error(`${m.id} 카드 오류`, e);
        slot.innerHTML = `<section class="card small error">${U.esc(m.title)} 요약을 불러오지 못했어요.</section>`;
      }
    });
  }

  function render(el) {
    const root = document.createElement('div');
    el.appendChild(root);
    const repaint = () => paint(root);

    root.addEventListener('submit', (e) => {
      if (e.target.dataset.form !== 'todo-add') return;
      e.preventDefault();
      const title = e.target.elements.title.value.trim();
      if (!title) return;
      saveTodos([...loadTodos(), { id: U.uid(), title, date: U.fmtDate(U.today()), done: false, doneAt: null }]);
      repaint();
      root.querySelector('[data-form="todo-add"] input').focus();
    });

    root.addEventListener('change', (e) => {
      const action = e.target.dataset.action;
      if (action === 'todo-check') {
        const id = e.target.closest('[data-todo]').dataset.todo;
        const list = loadTodos();
        const t = list.find((x) => x.id === id);
        t.done = e.target.checked;
        t.doneAt = t.done ? U.fmtDate(U.today()) : null;
        saveTodos(list);
        repaint();
      }
      if (action === 'dl-check') {
        deadlineMap.get(e.target.closest('[data-dl]').dataset.dl)?.complete(repaint);
      }
    });

    root.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-action]');
      if (!b) return;
      if (b.dataset.action === 'dl-do') {
        deadlineMap.get(b.closest('[data-dl]').dataset.dl)?.complete(repaint);
      }
      if (b.dataset.action === 'todo-del') {
        const id = b.closest('[data-todo]').dataset.todo;
        const before = loadTodos();
        saveTodos(before.filter((t) => t.id !== id));
        repaint();
        App.toast('삭제했어요', { label: '되돌리기', onClick: () => { saveTodos(before); repaint(); } });
      }
    });

    repaint();
  }

  App.register({ id: 'home', title: '홈', icon: '🏠', render });
})();
