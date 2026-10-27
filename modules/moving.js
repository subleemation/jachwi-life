// 이사 준비 체크리스트 모듈
// 항목 하나의 모양:
//   { id, title, category, offset, date, budget, memo, done, doneAt }
//   - offset: 입주일 기준 며칠 (-14 = 2주 전, 0 = 당일, 7 = 1주 후, null = 기한 없음)
//   - date:   날짜를 직접 정한 경우 'YYYY-MM-DD' (있으면 offset보다 우선)
// 기한을 offset으로 저장하기 때문에 설정에서 입주일을 바꾸면 모든 기한이 같이 움직인다.

(() => {
  const KEY = 'moving.items';
  const CATEGORIES = ['계약', '행정 신고', '인터넷·공과금', '가구·가전', '이사·청소', '주변 시설'];

  // [카테고리, 할 일, 입주 기준 일수, 예상 비용, 메모, 완료 여부]
  const DEFAULT_ITEMS = [
    ['계약', '월세 계약', null, 0, '계약서 원본은 확정일자·전입신고 때 필요하니 잘 보관하기', true],
    ['계약', '기본 옵션(가전·가구) 목록 받기', -40, 0, '옵션으로 있는 건 살 목록에서 빼면 돼요'],
    ['계약', '관리비에 포함된 항목 확인', -30, 0, '인터넷·수도·전기·가스 중 무엇이 관리비에 들어가는지'],
    ['계약', '집주인·관리실 연락처 저장', -30, 0, ''],

    ['행정 신고', '전월세 신고 (해당되면)', null, 0, '보증금 6천만 원 초과 또는 월세 30만 원 초과면 계약일로부터 30일 안에 신고. 신고하면 확정일자도 자동으로 받아져요'],
    ['행정 신고', '확정일자 받기', -30, 600, '계약서 원본 들고 주민센터, 또는 인터넷등기소. 계약 후 언제든 가능하니 빠를수록 좋아요'],
    ['행정 신고', '전입신고', 0, 0, '정부24 온라인 또는 주민센터. 법정 기한은 이사 후 14일 이내지만 입주 당일에 하는 게 안전 (대항력은 다음날 0시부터)'],
    ['행정 신고', '주소 변경 (은행·학교·쇼핑몰 배송지)', 7, 0, ''],

    ['인터넷·공과금', '인터넷 설치 신청', -14, 0, '건물 지정 통신사가 있는지 먼저 확인. 설치 기사 예약에 1~2주 걸릴 수 있어요'],
    ['인터넷·공과금', '도시가스 전입 신청 + 개통 예약', -7, 0, '지역 도시가스 회사 앱/전화. 개통은 기사 방문이 필요해서 미리 잡기'],
    ['인터넷·공과금', '전기 명의 변경·요금 정산', 0, 0, '한전ON 앱 또는 국번 없이 123'],
    ['인터넷·공과금', '수도 요금 정산·명의 확인', 0, 0, '관리비 포함이면 완료 처리. 아니면 관할 수도사업소'],

    ['가구·가전', '침대·매트리스', -14, 200000, ''],
    ['가구·가전', '책상·의자', -14, 100000, ''],
    ['가구·가전', '냉장고', -14, 0, '옵션이면 삭제'],
    ['가구·가전', '세탁기', -14, 0, '옵션이면 삭제'],
    ['가구·가전', '전자레인지', -7, 70000, ''],
    ['가구·가전', '전기밥솥', -7, 50000, ''],
    ['가구·가전', '침구 (이불·베개)', -7, 60000, ''],
    ['가구·가전', '커튼·블라인드', -7, 30000, '창문 크기 실측 후 구매'],
    ['가구·가전', '주방용품 (냄비·프라이팬·그릇·수저)', -7, 50000, ''],
    ['가구·가전', '욕실용품 (수건·샤워기 필터·발매트)', -3, 30000, ''],
    ['가구·가전', '청소용품 (청소기·밀대·쓰레기봉투)', -3, 60000, '종량제 봉투는 이사 가는 동네 것으로'],

    ['이사·청소', '이삿짐 목록 정리', -21, 0, ''],
    ['이사·청소', '이사 방법 정하고 예약 (용달·택배)', -14, 100000, ''],
    ['이사·청소', '입주 전 청소', -1, 0, '짐 들어가기 전에. 곰팡이·배수구·창틀 확인'],
    ['이사·청소', '하자 사진 찍어 집주인에게 보내기', 0, 0, '벽지·바닥·옵션 가전 상태. 퇴실할 때 분쟁 예방'],
    ['이사·청소', '계량기 사진 찍기 (전기·가스·수도)', 0, 0, ''],
    ['이사·청소', '도어락 비밀번호 변경', 0, 0, ''],

    ['주변 시설', '분리수거 요일·장소 확인', 3, 0, '건물마다 달라요. 게시판이나 관리인에게 확인'],
    ['주변 시설', '통학 경로·버스 시간 확인', 3, 0, ''],
    ['주변 시설', '마트·편의점 위치', 7, 0, ''],
    ['주변 시설', '병원·약국 위치', 7, 0, ''],
    ['주변 시설', '코인세탁소·세탁소 위치', 7, 0, ''],
    ['주변 시설', '헬스장 알아보기', 7, 0, '학교 체육시설 이용료와 비교해 보기'],
  ];

  // ---------- 데이터 ----------
  function seed() {
    const today = U.fmtDate(U.today());
    return DEFAULT_ITEMS.map(([category, title, offset, budget, memo, done]) => ({
      id: U.uid(), title, category, offset, date: null, budget, memo,
      done: !!done, doneAt: done ? today : null,
    }));
  }

  function load() {
    let items = Store.get(KEY);
    if (!Array.isArray(items)) {
      items = seed();
      save(items);
    }
    return items;
  }

  function save(items) {
    Store.set(KEY, items);
  }

  function dueDate(item) {
    if (item.date) return U.parseDate(item.date);
    if (typeof item.offset === 'number') return U.addDays(App.moveInDate(), item.offset);
    return null;
  }

  function daysLeft(item) {
    const d = dueDate(item);
    return d ? U.diffDays(U.today(), d) : null;
  }

  // overdue(기한 지남) / soon(7일 이내) / later / none(기한 없음) / done
  function urgency(item) {
    if (item.done) return 'done';
    const n = daysLeft(item);
    if (n === null) return 'none';
    if (n < 0) return 'overdue';
    if (n <= 7) return 'soon';
    return 'later';
  }

  function byDue(a, b) {
    const da = dueDate(a);
    const db = dueDate(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da - db;
  }

  function leftLabel(n) {
    if (n > 0) return `${n}일 남음`;
    if (n === 0) return '오늘까지';
    return `${-n}일 지남`;
  }

  function offsetLabel(item) {
    if (item.date) return '날짜 지정';
    if (item.offset == null) return '';
    if (item.offset === 0) return '입주 당일';
    return item.offset < 0 ? `입주 ${-item.offset}일 전` : `입주 ${item.offset}일 후`;
  }

  function categoriesOf(items) {
    const extra = [...new Set(items.map((i) => i.category))].filter((c) => !CATEGORIES.includes(c));
    return [...CATEGORIES, ...extra];
  }

  // ---------- 화면 ----------
  let filter = 'todo';     // all | todo | done
  let view = 'category';   // category | due

  function itemHtml(item, showCategory) {
    const d = dueDate(item);
    const u = urgency(item);
    const meta = [];
    if (d) {
      const left = item.done ? '' : ` · ${leftLabel(daysLeft(item))}`;
      meta.push(`<span class="due due-${u}">${U.prettyDate(d)}${left}</span>`);
    }
    if (item.budget) meta.push(`<span>${U.won(item.budget)}</span>`);
    if (showCategory) meta.push(`<span class="badge">${U.esc(item.category)}</span>`);

    return `
      <li class="check-item ${item.done ? 'is-done' : ''}" data-id="${item.id}">
        <label class="check" aria-label="완료 표시">
          <input type="checkbox" data-action="toggle" ${item.done ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>
        <button type="button" class="check-body" data-action="edit">
          <span class="check-title">${U.esc(item.title)}</span>
          ${meta.length ? `<span class="check-meta">${meta.join('')}</span>` : ''}
          ${item.memo ? `<span class="check-memo">${U.esc(item.memo)}</span>` : ''}
        </button>
      </li>`;
  }

  function listHtml(items) {
    const visible = items.filter((i) => filter === 'all' || (filter === 'done' ? i.done : !i.done));
    if (!visible.length) {
      return filter === 'todo'
        ? '<div class="empty"><div class="big">🎉</div>남은 할 일이 없어요!</div>'
        : '<div class="empty">항목이 없어요.</div>';
    }

    if (view === 'due') {
      const sorted = [...visible].sort(byDue);
      return `<div class="group-head"><h3>기한 순서</h3><span class="meta">${sorted.length}개</span></div>
        <ul class="checklist">${sorted.map((i) => itemHtml(i, true)).join('')}</ul>`;
    }

    return categoriesOf(items).map((cat) => {
      const all = items.filter((i) => i.category === cat);
      const shown = visible.filter((i) => i.category === cat).sort(byDue);
      if (!shown.length) return '';
      const budget = U.sum(all, (i) => i.budget);
      const meta = `${all.filter((i) => i.done).length}/${all.length}` + (budget ? ` · ${U.won(budget)}` : '');
      return `<div class="group-head"><h3>${U.esc(cat)}</h3><span class="meta">${meta}</span></div>
        <ul class="checklist">${shown.map((i) => itemHtml(i, false)).join('')}</ul>`;
    }).join('');
  }

  function paint(root) {
    const items = load();
    const doneCount = items.filter((i) => i.done).length;
    const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
    const overdue = items.filter((i) => urgency(i) === 'overdue').length;
    const soon = items.filter((i) => urgency(i) === 'soon').length;
    const budgetTotal = U.sum(items, (i) => i.budget);
    const budgetLeft = U.sum(items.filter((i) => !i.done), (i) => i.budget);
    const chip = (group, value, label) =>
      `<button type="button" class="chip ${(group === 'filter' ? filter : view) === value ? 'active' : ''}" data-${group}="${value}">${label}</button>`;

    root.innerHTML = `
      <section class="card">
        <div class="card-head">
          <h2>준비 진행률 ${pct}%</h2>
          <span class="muted small">${doneCount} / ${items.length} 완료</span>
        </div>
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div class="stats">
          <div class="stat ${overdue ? 'danger' : ''}"><b>${overdue}</b><span>기한 지남</span></div>
          <div class="stat ${soon ? 'warn' : ''}"><b>${soon}</b><span>일주일 안</span></div>
          <div class="stat"><b>${Math.round(budgetLeft / 10000).toLocaleString('ko-KR')}만원</b><span>남은 비용</span></div>
        </div>
        <p class="hint">예상 비용 합계 ${U.won(budgetTotal)} · 입주일 ${U.prettyDate(App.moveInDate())}</p>
      </section>

      <div class="chips">
        ${chip('filter', 'todo', '할 일')}${chip('filter', 'done', '완료')}${chip('filter', 'all', '전체')}
        <span class="divider"></span>
        ${chip('view', 'category', '카테고리별')}${chip('view', 'due', '기한순')}
      </div>

      ${listHtml(items)}

      <button type="button" class="fab" data-action="add">＋ 항목 추가</button>`;
  }

  function setDone(id, done) {
    const items = load();
    const item = items.find((i) => i.id === id);
    if (!item) return;
    item.done = done;
    item.doneAt = done ? U.fmtDate(U.today()) : null;
    save(items);
    return item;
  }

  function render(el) {
    const root = document.createElement('div');
    el.appendChild(root);

    root.addEventListener('click', (e) => {
      const t = e.target;
      if (t.dataset.filter) { filter = t.dataset.filter; paint(root); return; }
      if (t.dataset.view) { view = t.dataset.view; paint(root); return; }
      const action = t.closest('[data-action]')?.dataset.action;
      if (action === 'add') openEditor(null, () => paint(root));
      if (action === 'edit') {
        const id = t.closest('[data-id]').dataset.id;
        openEditor(load().find((i) => i.id === id), () => paint(root));
      }
    });

    root.addEventListener('change', (e) => {
      if (e.target.dataset.action !== 'toggle') return;
      const id = e.target.closest('[data-id]').dataset.id;
      const done = e.target.checked;
      const item = setDone(id, done);
      paint(root);
      if (done) {
        App.toast(`✅ ${item.title}`, {
          label: '되돌리기',
          onClick: () => { setDone(id, false); paint(root); },
        });
      }
    });

    paint(root);
  }

  // ---------- 추가/수정 창 ----------
  function openEditor(item, onSaved) {
    const isNew = !item;
    const items = load();
    const cats = categoriesOf(items);
    const current = item || { title: '', category: '가구·가전', offset: -7, date: null, budget: 0, memo: '' };
    const mode = current.date ? 'date'
      : current.offset == null ? 'none'
      : current.offset < 0 ? 'before'
      : current.offset > 0 ? 'after' : 'on';

    const dlg = App.modal(isNew ? '할 일 추가' : '할 일 수정', `
      <label class="field"><span>할 일</span>
        <input name="title" maxlength="60" placeholder="예: 행거 사기" autocomplete="off">
      </label>
      <label class="field"><span>카테고리</span>
        <select name="category">
          ${cats.map((c) => `<option>${U.esc(c)}</option>`).join('')}
          <option value="__new">＋ 새 카테고리…</option>
        </select>
        <input name="newCategory" maxlength="20" placeholder="새 카테고리 이름" style="margin-top:8px" hidden>
      </label>
      <div class="field">
        <span class="field-label">기한</span>
        <div class="row">
          <select name="mode">
            <option value="before">입주 N일 전</option>
            <option value="on">입주 당일</option>
            <option value="after">입주 N일 후</option>
            <option value="date">날짜 직접 선택</option>
            <option value="none">기한 없음</option>
          </select>
          <input name="days" type="number" min="1" max="365" inputmode="numeric" aria-label="일수">
          <input name="date" type="date" aria-label="날짜">
        </div>
        <small class="hint" data-preview></small>
      </div>
      <label class="field"><span>예상 비용 (원, 선택)</span>
        <input name="budget" type="number" min="0" step="1000" inputmode="numeric" placeholder="0">
      </label>
      <label class="field"><span>메모 (선택)</span>
        <textarea name="memo" rows="3" maxlength="300"></textarea>
      </label>
      <small class="hint error" data-error></small>
      <div class="modal-actions">
        ${isNew ? '' : '<button type="button" class="btn danger" data-delete>삭제</button>'}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>`);

    const form = dlg.querySelector('form');
    const f = form.elements;
    f.title.value = current.title;
    f.category.value = cats.includes(current.category) ? current.category : cats[0];
    f.mode.value = mode;
    f.days.value = current.offset ? Math.abs(current.offset) : 7;
    f.date.value = current.date || U.fmtDate(dueDate(current) || App.moveInDate());
    f.budget.value = current.budget || '';
    f.memo.value = current.memo || '';

    // 선택한 기한 방식에 따라 입력칸 보이기 + 실제 날짜 미리보기
    function readDeadline() {
      const m = f.mode.value;
      const days = Math.max(1, parseInt(f.days.value, 10) || 1);
      if (m === 'date') return { offset: null, date: f.date.value || null };
      if (m === 'none') return { offset: null, date: null };
      return { offset: m === 'before' ? -days : m === 'after' ? days : 0, date: null };
    }
    function update() {
      const m = f.mode.value;
      f.days.hidden = !(m === 'before' || m === 'after');
      f.date.hidden = m !== 'date';
      f.newCategory.hidden = f.category.value !== '__new';
      const d = dueDate(readDeadline());
      dlg.querySelector('[data-preview]').textContent = d
        ? `→ ${U.prettyDate(d, true)}까지 (${leftLabel(U.diffDays(U.today(), d))})`
        : '기한 없이 목록에만 둡니다.';
    }
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();
    if (isNew) f.title.focus();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const title = f.title.value.trim();
      const category = f.category.value === '__new' ? f.newCategory.value.trim() : f.category.value;
      const error = dlg.querySelector('[data-error]');
      if (!title) { error.textContent = '할 일을 입력해 주세요.'; f.title.focus(); return; }
      if (!category) { error.textContent = '새 카테고리 이름을 입력해 주세요.'; f.newCategory.focus(); return; }
      if (f.mode.value === 'date' && !f.date.value) { error.textContent = '날짜를 골라 주세요.'; return; }

      const data = {
        title,
        category,
        ...readDeadline(),
        budget: Math.max(0, parseInt(f.budget.value, 10) || 0),
        memo: f.memo.value.trim(),
      };
      const list = load();
      if (isNew) {
        list.push({ id: U.uid(), done: false, doneAt: null, ...data });
      } else {
        Object.assign(list.find((i) => i.id === item.id), data);
      }
      save(list);
      dlg.close();
      onSaved();
      App.toast(isNew ? '추가했어요' : '저장했어요');
    });

    dlg.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (!confirm(`'${item.title}' 항목을 삭제할까요?`)) return;
      save(load().filter((i) => i.id !== item.id));
      dlg.close();
      onSaved();
      App.toast('삭제했어요');
    });
  }

  // ---------- 홈 화면에 주는 정보 ----------
  // 기한 있는 안 끝난 항목 → 홈의 '오늘 할 일'(기한 지남/오늘)과 'D-day'(앞으로)에 나온다
  function deadlines() {
    return load().filter((i) => !i.done && dueDate(i)).map((i) => ({
      key: `moving:${i.id}`,
      icon: '📦',
      title: i.title,
      date: dueDate(i),
      source: '이사 준비',
      href: '#/moving',
      checkable: true,
      complete(onDone) {
        setDone(i.id, true);
        onDone();
        App.toast(`✅ ${i.title}`, { label: '되돌리기', onClick: () => { setDone(i.id, false); onDone(); } });
      },
    }));
  }

  function stat() {
    const items = load();
    const doneCount = items.filter((i) => i.done).length;
    const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;
    return { icon: '📦', label: '이사 준비', value: `${pct}%`, sub: `${doneCount}/${items.length} 완료`, pct, href: '#/moving' };
  }

  App.register({ id: 'moving', title: '이사 준비', icon: '📦', render, api: { deadlines, stat } });
})();
