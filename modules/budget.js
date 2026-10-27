// 가계부 모듈: 지출 기록 + 월 예산 + 카테고리 통계 + 고정 지출(공과금·구독) 납부일
//
// 저장 데이터
//   budget.tx       지출 기록 [{ id, date:'YYYY-MM-DD', amount, category, memo, billId?, billMonth? }]
//   budget.bills    고정 지출 [{ id, name, amount, category, cycle:'monthly'|'yearly', month, day,
//                                startMonth:'YYYY-MM', autopay, memo, paid: { 'YYYY-MM': txId } }]
//   budget.settings { monthlyBudget }
//
// 고정 지출에서 "납부"를 체크하면 지출 기록(tx)이 하나 만들어지고, bill.paid[그 달] 에 그 기록의 id가 남는다.
// 그 지출 기록을 지우면 납부 표시도 같이 풀린다.

(() => {
  const TX = 'budget.tx';
  const BILLS = 'budget.bills';
  const SETTINGS = 'budget.settings';

  // fixed: true 인 카테고리는 '고정비'로 묶여서 통계에 따로 표시된다
  const CATS = [
    { id: 'rent', name: '월세', icon: '🏠', fixed: true },
    { id: 'mgmt', name: '관리비', icon: '🏢', fixed: true },
    { id: 'utility', name: '공과금', icon: '💡', fixed: true },
    { id: 'telecom', name: '통신·구독', icon: '📱', fixed: true },
    { id: 'food', name: '식비', icon: '🍚' },
    { id: 'grocery', name: '장보기', icon: '🛒' },
    { id: 'cafe', name: '카페·간식', icon: '☕' },
    { id: 'transport', name: '교통', icon: '🚌' },
    { id: 'living', name: '생활용품', icon: '🧴' },
    { id: 'study', name: '학업', icon: '📚' },
    { id: 'health', name: '운동·건강', icon: '💪' },
    { id: 'fun', name: '여가', icon: '🎮' },
    { id: 'etc', name: '기타', icon: '📦' },
  ];
  const cat = (id) => CATS.find((c) => c.id === id) || CATS[CATS.length - 1];

  // ---------- 데이터 ----------
  const loadTx = () => Store.get(TX, []);
  const saveTx = (list) => Store.set(TX, list);
  const saveBills = (list) => Store.set(BILLS, list);
  const settings = () => ({ monthlyBudget: 600000, ...Store.get(SETTINGS, {}) });

  function seedBills() {
    const moveIn = U.monthKey(App.moveInDate());
    const now = U.addMonths(U.monthKey(U.today()), 1);   // 처음부터 '미납'이 뜨지 않게 다음 달부터
    const day = App.moveInDate().getDate();
    const hint = '금액·날짜를 확인해서 수정하기';
    const b = (name, category, d, startMonth, memo = hint) => ({
      id: U.uid(), name, amount: 0, category, cycle: 'monthly', month: 1, day: d,
      startMonth, autopay: false, memo, paid: {},
    });
    return [
      b('월세', 'rent', day, moveIn, '계약서의 월세 금액·납부일로 수정하기'),
      b('관리비', 'mgmt', day, moveIn),
      b('전기요금', 'utility', 25, moveIn, '한전 고지서의 납기일 확인'),
      b('도시가스', 'utility', 25, moveIn, '도시가스 회사 고지서의 납기일 확인'),
      b('인터넷', 'telecom', 25, moveIn),
      b('휴대폰', 'telecom', 25, now),
    ];
  }

  function loadBills() {
    let list = Store.get(BILLS);
    if (!Array.isArray(list)) {
      list = seedBills();
      saveBills(list);
    }
    return list;
  }

  const txOfMonth = (month) => loadTx().filter((t) => t.date.startsWith(month));

  // 이 고정 지출이 그 달에 내야 하는 것인지 + 그렇다면 납부일
  function dueInMonth(bill, month) {
    if (bill.startMonth && month < bill.startMonth) return null;
    if (bill.cycle === 'yearly' && Number(month.slice(5)) !== Number(bill.month)) return null;
    const day = Math.min(bill.day, U.daysInMonth(month));
    return U.parseDate(`${month}-${String(day).padStart(2, '0')}`);
  }

  function billsOfMonth(month) {
    return loadBills()
      .map((bill) => ({ bill, month, due: dueInMonth(bill, month), paid: !!bill.paid?.[month] }))
      .filter((x) => x.due)
      .sort((a, b) => a.due - b.due);
  }

  function billStatus(entry) {
    if (entry.paid) return 'done';
    const n = U.diffDays(U.today(), entry.due);
    if (n < 0) return 'overdue';
    if (n <= 5) return 'soon';
    return 'later';
  }

  function billLeft(entry) {
    if (entry.paid) return '납부 완료';
    const n = U.diffDays(U.today(), entry.due);
    if (n > 0) return `D-${n}`;
    if (n === 0) return '오늘 납부일';
    return `${-n}일 지남 · 미납`;
  }

  // 지난달~다음 달 중 아직 안 낸 것 (홈 화면용): 기한 지난 것 + days일 안에 낼 것
  function upcomingBills(days = 14) {
    const cur = U.monthKey(U.today());
    return [U.addMonths(cur, -1), cur, U.addMonths(cur, 1)]
      .flatMap(billsOfMonth)
      .filter((x) => !x.paid && U.diffDays(U.today(), x.due) <= days)
      .sort((a, b) => a.due - b.due);
  }

  function monthSummary(month) {
    const list = txOfMonth(month);
    const spent = U.sum(list, (t) => t.amount);
    const fixed = U.sum(list.filter((t) => cat(t.category).fixed), (t) => t.amount);
    const budget = settings().monthlyBudget;
    return { list, spent, fixed, variable: spent - fixed, budget, left: budget - spent };
  }

  // ---------- 화면 상태 ----------
  let tab = 'list';                      // list | stats | bills
  let month = U.monthKey(U.today());

  function progressHtml(spent, budget) {
    const ratio = budget ? spent / budget : 0;
    const cls = ratio > 1 ? 'over' : ratio > 0.85 ? 'high' : '';
    return `<div class="progress ${cls}"><span style="width:${Math.min(100, ratio * 100)}%"></span></div>`;
  }

  function summaryHtml() {
    const s = monthSummary(month);
    const isCurrent = month === U.monthKey(U.today());
    let guide = '';
    if (isCurrent && s.left > 0) {
      const daysLeft = U.daysInMonth(month) - U.today().getDate() + 1;
      guide = `남은 ${daysLeft}일 동안 하루 약 <b>${U.won(s.left / daysLeft)}</b> 쓸 수 있어요`;
    } else if (s.left < 0) {
      guide = `예산을 <b class="neg">${U.won(-s.left)}</b> 넘었어요`;
    }

    return `
      <section class="card">
        <div class="card-head">
          <h2>${U.prettyMonth(month)} 지출</h2>
          <button type="button" class="link-btn" data-action="edit-budget">예산 ${U.won(s.budget)} ✎</button>
        </div>
        <div class="big-num">${U.won(s.spent)}</div>
        <div style="margin:10px 0 6px">${progressHtml(s.spent, s.budget)}</div>
        <div class="stats">
          <div class="stat"><b class="${s.left < 0 ? 'neg' : ''}">${U.won(s.left)}</b><span>남은 예산</span></div>
          <div class="stat"><b>${U.won(s.fixed)}</b><span>고정비</span></div>
          <div class="stat"><b>${U.won(s.variable)}</b><span>변동비</span></div>
        </div>
        ${guide ? `<p class="hint">${guide}</p>` : ''}
      </section>`;
  }

  function txItemHtml(t) {
    const c = cat(t.category);
    return `
      <li class="tx-item" data-tx="${t.id}">
        <button type="button" class="tx-body" data-action="edit-tx">
          <span class="tx-icon" aria-hidden="true">${c.icon}</span>
          <span class="tx-main">
            <span class="tx-title">${U.esc(t.memo || c.name)}</span>
            <span class="tx-sub">${c.name}${t.billId ? ' · 고정 지출' : ''}</span>
          </span>
          <span class="tx-amount">${U.won(t.amount)}</span>
        </button>
      </li>`;
  }

  function listTabHtml() {
    const list = txOfMonth(month).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (!list.length) {
      return summaryHtml() + '<div class="empty"><div class="big">🧾</div>이 달의 지출 기록이 없어요.<br>아래 버튼으로 기록해 보세요.</div>';
    }
    const days = [...new Set(list.map((t) => t.date))];
    return summaryHtml() + days.map((d) => {
      const items = list.filter((t) => t.date === d);
      return `
        <div class="day-head"><span>${U.prettyDate(U.parseDate(d))}</span><span>${U.won(U.sum(items, (t) => t.amount))}</span></div>
        <ul class="checklist">${items.map(txItemHtml).join('')}</ul>`;
    }).join('');
  }

  function statsTabHtml() {
    const s = monthSummary(month);
    const groups = CATS
      .map((c) => ({ c, amount: U.sum(s.list.filter((t) => cat(t.category).id === c.id), (t) => t.amount) }))
      .filter((g) => g.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const max = groups[0]?.amount || 1;

    const catCard = groups.length ? `
      <ul class="bars">${groups.map((g) => `
        <li>
          <div class="bar-row-head">
            <span>${g.c.icon} ${g.c.name}</span>
            <span><b>${U.won(g.amount)}</b> <span class="muted small">${Math.round((g.amount / s.spent) * 100)}%</span></span>
          </div>
          <div class="bar-track ${g.c.fixed ? 'fixed' : ''}"><span style="width:${(g.amount / max) * 100}%"></span></div>
        </li>`).join('')}
      </ul>
      <div class="legend"><span><i style="background:var(--primary)"></i>변동비</span><span><i style="background:#8b6cf0"></i>고정비</span></div>`
      : '<p class="muted small" style="margin:0">이 달의 지출 기록이 없어요.</p>';

    // 최근 6개월 추이
    const months = [-5, -4, -3, -2, -1, 0].map((n) => U.addMonths(month, n));
    const totals = months.map((m) => U.sum(txOfMonth(m), (t) => t.amount));
    const top = Math.max(...totals, s.budget) || 1;
    const short = (n) => (n >= 10000 ? `${Math.round(n / 10000)}만` : n ? n.toLocaleString('ko-KR') : '');
    const BAR_MAX = 88;      // 막대 최대 높이(px)
    const LABEL_H = 22;      // 아래 '10월' 글자 + 간격 높이(px)
    const trend = `
      <div class="trend">
        <div class="trend-line" style="bottom:${LABEL_H + (s.budget / top) * BAR_MAX}px"><span>예산 ${short(s.budget)}</span></div>
        ${months.map((m, i) => `
          <div class="trend-col ${m === month ? 'current' : ''} ${totals[i] > s.budget ? 'over' : ''}">
            <span class="trend-val">${short(totals[i])}</span>
            <div class="trend-bar" style="height:${(totals[i] / top) * BAR_MAX}px"></div>
            <span class="trend-label">${Number(m.slice(5))}월</span>
          </div>`).join('')}
      </div>`;

    return `
      <section class="card">
        <div class="card-head"><h2>카테고리별 지출</h2><span class="muted small">총 ${U.won(s.spent)}</span></div>
        ${catCard}
      </section>
      <section class="card">
        <div class="card-head"><h2>월별 추이</h2><span class="muted small">점선 = 월 예산</span></div>
        ${trend}
      </section>`;
  }

  function billsTabHtml() {
    const entries = billsOfMonth(month);
    const total = U.sum(entries, (e) => e.bill.amount);
    const paidCount = entries.filter((e) => e.paid).length;
    const unpaid = U.sum(entries.filter((e) => !e.paid), (e) => e.bill.amount);

    const items = entries.map((e) => {
      const st = billStatus(e);
      const b = e.bill;
      const tx = e.paid ? loadTx().find((t) => t.id === b.paid[month]) : null;
      const badges = [
        b.autopay ? '<span class="badge">자동이체</span>' : '',
        b.cycle === 'yearly' ? '<span class="badge">매년</span>' : '',
      ].join('');
      return `
        <li class="check-item ${e.paid ? 'is-done' : ''}" data-bill="${b.id}">
          <label class="check" aria-label="납부 표시">
            <input type="checkbox" data-action="pay" ${e.paid ? 'checked' : ''}>
            <span class="checkmark"></span>
          </label>
          <button type="button" class="check-body" data-action="edit-bill">
            <span class="check-title">${cat(b.category).icon} ${U.esc(b.name)} ${badges}</span>
            <span class="check-meta">
              <span class="due due-${st}">${U.prettyDate(e.due)} · ${billLeft(e)}</span>
              <span>${tx ? U.won(tx.amount) : b.amount ? U.won(b.amount) : '금액 미정'}</span>
            </span>
            ${b.memo ? `<span class="check-memo">${U.esc(b.memo)}</span>` : ''}
          </button>
        </li>`;
    }).join('');

    return `
      <section class="card">
        <div class="card-head"><h2>${U.prettyMonth(month)} 고정 지출</h2><span class="muted small">${paidCount} / ${entries.length} 납부</span></div>
        <div class="stats">
          <div class="stat"><b>${U.won(total)}</b><span>예정 합계</span></div>
          <div class="stat ${unpaid ? 'warn' : ''}"><b>${U.won(unpaid)}</b><span>남은 납부</span></div>
          <div class="stat"><b>${entries.length - paidCount}건</b><span>남은 건수</span></div>
        </div>
        <p class="hint">체크하면 납부 금액이 지출 내역에 자동으로 기록돼요.</p>
      </section>
      ${entries.length
        ? `<ul class="checklist">${items}</ul>`
        : '<div class="empty">이 달에 낼 고정 지출이 없어요.</div>'}`;
  }

  function paint(root) {
    const tabBtn = (id, label) => `<button type="button" class="${tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`;
    const isCurrent = month === U.monthKey(U.today());
    const body = tab === 'list' ? listTabHtml() : tab === 'stats' ? statsTabHtml() : billsTabHtml();

    root.innerHTML = `
      <div class="seg">${tabBtn('list', '내역')}${tabBtn('stats', '통계')}${tabBtn('bills', '납부일')}</div>
      <div class="month-nav">
        <button type="button" class="icon-btn" data-month="-1" aria-label="이전 달">‹</button>
        <b>${U.prettyMonth(month)}</b>
        <button type="button" class="icon-btn" data-month="1" aria-label="다음 달">›</button>
        ${isCurrent ? '' : '<button type="button" class="btn today-btn" data-month="0">이번 달</button>'}
      </div>
      ${body}
      <button type="button" class="fab" data-action="${tab === 'bills' ? 'add-bill' : 'add-tx'}">
        ${tab === 'bills' ? '＋ 고정 지출 추가' : '＋ 지출 기록'}
      </button>`;
  }

  function render(el) {
    const root = document.createElement('div');
    el.appendChild(root);
    const repaint = () => paint(root);

    root.addEventListener('click', (e) => {
      const t = e.target.closest('button, [data-action]');
      if (!t) return;
      if (t.dataset.tab) { tab = t.dataset.tab; repaint(); return; }
      if (t.dataset.month !== undefined) {
        const n = Number(t.dataset.month);
        month = n === 0 ? U.monthKey(U.today()) : U.addMonths(month, n);
        repaint();
        return;
      }
      switch (t.dataset.action) {
        case 'add-tx': openTxEditor(null, repaint); break;
        case 'edit-tx': openTxEditor(loadTx().find((x) => x.id === t.closest('[data-tx]').dataset.tx), repaint); break;
        case 'add-bill': openBillEditor(null, repaint); break;
        case 'edit-bill': openBillEditor(loadBills().find((x) => x.id === t.closest('[data-bill]').dataset.bill), repaint); break;
        case 'edit-budget': openBudgetEditor(repaint); break;
        default:
      }
    });

    root.addEventListener('change', (e) => {
      if (e.target.dataset.action !== 'pay') return;
      e.target.checked = !e.target.checked;   // 실제 상태는 창에서 확인 후 바꾼다
      const bill = loadBills().find((b) => b.id === e.target.closest('[data-bill]').dataset.bill);
      if (bill.paid?.[month]) {
        if (confirm(`${bill.name} 납부 표시를 취소할까요? 기록된 지출도 함께 지워져요.`)) {
          unpay(bill.id, month);
          repaint();
        }
      } else {
        openPay(bill, month, repaint);
      }
    });

    repaint();
  }

  // ---------- 납부 처리 ----------
  function unpay(billId, m) {
    const bills = loadBills();
    const bill = bills.find((b) => b.id === billId);
    const txId = bill.paid?.[m];
    delete bill.paid[m];
    saveBills(bills);
    if (txId) saveTx(loadTx().filter((t) => t.id !== txId));
  }

  function openPay(bill, m, onSaved) {
    const due = dueInMonth(bill, m);
    const defaultDate = m === U.monthKey(U.today()) ? U.today() : due;
    const dlg = App.modal(`${bill.name} 납부 (${Number(m.slice(5))}월분)`, `
      <label class="field"><span>낸 금액</span>
        <input name="amount" class="money-input" inputmode="numeric" autocomplete="off" placeholder="0">
      </label>
      <label class="field"><span>낸 날짜</span><input name="date" type="date"></label>
      <label class="check-line"><input type="checkbox" name="remember"> 다음 달부터 이 금액을 기본값으로</label>
      <small class="hint error" data-error></small>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn primary">납부 기록</button>
      </div>`);
    const form = dlg.querySelector('form');
    const f = form.elements;
    U.bindMoneyInput(f.amount);
    f.amount.value = bill.amount ? bill.amount.toLocaleString('ko-KR') : '';
    f.date.value = U.fmtDate(defaultDate);
    f.remember.checked = !bill.amount;
    if (!bill.amount) f.amount.focus();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = U.parseWon(f.amount.value);
      if (!amount) { dlg.querySelector('[data-error]').textContent = '금액을 입력해 주세요.'; return; }
      const tx = {
        id: U.uid(), date: f.date.value || U.fmtDate(defaultDate), amount,
        category: bill.category, memo: bill.name, billId: bill.id, billMonth: m,
      };
      saveTx([...loadTx(), tx]);
      const bills = loadBills();
      const target = bills.find((b) => b.id === bill.id);
      target.paid = { ...target.paid, [m]: tx.id };
      if (f.remember.checked) target.amount = amount;
      saveBills(bills);
      dlg.close();
      onSaved();
      App.toast(`✅ ${bill.name} ${U.won(amount)} 납부 기록`);
    });
  }

  // ---------- 지출 기록 추가/수정 ----------
  function openTxEditor(tx, onSaved) {
    const isNew = !tx;
    const current = tx || {
      amount: 0, category: 'food', memo: '',
      date: month === U.monthKey(U.today()) ? U.fmtDate(U.today()) : `${month}-01`,
    };

    const dlg = App.modal(isNew ? '지출 기록' : '지출 수정', `
      <label class="field"><span>금액</span>
        <input name="amount" class="money-input" inputmode="numeric" autocomplete="off" placeholder="0">
      </label>
      <div class="field">
        <span class="field-label">카테고리</span>
        <div class="cat-grid">${CATS.map((c) => `
          <label class="cat-opt"><input type="radio" name="category" value="${c.id}"><span>${c.icon}<small>${c.name}</small></span></label>`).join('')}
        </div>
      </div>
      <div class="row">
        <label class="field"><span>날짜</span><input name="date" type="date"></label>
        <label class="field"><span>내용 (선택)</span><input name="memo" maxlength="40" placeholder="예: 학식" autocomplete="off"></label>
      </div>
      <small class="hint error" data-error></small>
      <div class="modal-actions">
        ${isNew ? '' : '<button type="button" class="btn danger" data-delete>삭제</button>'}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>`);

    const form = dlg.querySelector('form');
    const f = form.elements;
    U.bindMoneyInput(f.amount);
    f.amount.value = current.amount ? current.amount.toLocaleString('ko-KR') : '';
    f.category.value = cat(current.category).id;
    f.date.value = current.date;
    f.memo.value = current.memo || '';
    if (isNew) f.amount.focus();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const amount = U.parseWon(f.amount.value);
      const error = dlg.querySelector('[data-error]');
      if (!amount) { error.textContent = '금액을 입력해 주세요.'; f.amount.focus(); return; }
      if (!f.date.value) { error.textContent = '날짜를 골라 주세요.'; return; }
      const data = { amount, category: f.category.value, date: f.date.value, memo: f.memo.value.trim() };
      const list = loadTx();
      if (isNew) list.push({ id: U.uid(), ...data });
      else Object.assign(list.find((t) => t.id === tx.id), data);
      saveTx(list);
      dlg.close();
      onSaved();
      App.toast(isNew ? `${U.won(amount)} 기록했어요` : '저장했어요');
    });

    dlg.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (!confirm('이 지출 기록을 삭제할까요?')) return;
      if (tx.billId) {
        unpay(tx.billId, tx.billMonth);   // 납부 표시도 풀고 기록도 지운다
      } else {
        saveTx(loadTx().filter((t) => t.id !== tx.id));
      }
      dlg.close();
      onSaved();
      App.toast('삭제했어요');
    });
  }

  // ---------- 고정 지출 추가/수정 ----------
  function openBillEditor(bill, onSaved) {
    const isNew = !bill;
    const current = bill || {
      name: '', amount: 0, category: 'telecom', cycle: 'monthly', month: Number(month.slice(5)),
      day: 25, startMonth: month, autopay: false, memo: '',
    };
    const fixedCats = CATS.filter((c) => c.fixed);
    const otherCats = CATS.filter((c) => !c.fixed);
    const options = (list) => list.map((c) => `<option value="${c.id}">${c.icon} ${c.name}</option>`).join('');

    const dlg = App.modal(isNew ? '고정 지출 추가' : '고정 지출 수정', `
      <label class="field"><span>이름</span>
        <input name="name" maxlength="30" placeholder="예: 유튜브 프리미엄" autocomplete="off">
      </label>
      <div class="row">
        <label class="field"><span>금액 (매번)</span>
          <input name="amount" inputmode="numeric" autocomplete="off" placeholder="모르면 비워두기">
        </label>
        <label class="field"><span>카테고리</span>
          <select name="category"><optgroup label="고정비">${options(fixedCats)}</optgroup><optgroup label="기타">${options(otherCats)}</optgroup></select>
        </label>
      </div>
      <div class="row">
        <label class="field"><span>주기</span>
          <select name="cycle"><option value="monthly">매달</option><option value="yearly">매년</option></select>
        </label>
        <label class="field" data-yearly><span>월</span>
          <select name="month">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1}월</option>`).join('')}</select>
        </label>
        <label class="field"><span>납부일</span>
          <select name="day">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}일</option>`).join('')}</select>
        </label>
      </div>
      <label class="field"><span>시작 월</span><input name="startMonth" type="month"></label>
      <label class="check-line"><input type="checkbox" name="autopay"> 자동이체로 나가요</label>
      <label class="field"><span>메모 (선택)</span><input name="memo" maxlength="60" autocomplete="off"></label>
      <small class="hint">31일처럼 그 달에 없는 날짜는 그 달 마지막 날로 계산해요.</small>
      <small class="hint error" data-error></small>
      <div class="modal-actions">
        ${isNew ? '' : '<button type="button" class="btn danger" data-delete>삭제</button>'}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>`);

    const form = dlg.querySelector('form');
    const f = form.elements;
    U.bindMoneyInput(f.amount);
    f.name.value = current.name;
    f.amount.value = current.amount ? current.amount.toLocaleString('ko-KR') : '';
    f.category.value = current.category;
    f.cycle.value = current.cycle;
    f.month.value = String(current.month || 1);
    f.day.value = String(current.day);
    f.startMonth.value = current.startMonth || '';
    f.autopay.checked = !!current.autopay;
    f.memo.value = current.memo || '';
    const yearly = dlg.querySelector('[data-yearly]');
    const update = () => { yearly.hidden = f.cycle.value !== 'yearly'; };
    f.cycle.addEventListener('change', update);
    update();
    if (isNew) f.name.focus();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = f.name.value.trim();
      if (!name) { dlg.querySelector('[data-error]').textContent = '이름을 입력해 주세요.'; f.name.focus(); return; }
      const data = {
        name,
        amount: U.parseWon(f.amount.value),
        category: f.category.value,
        cycle: f.cycle.value,
        month: Number(f.month.value),
        day: Number(f.day.value),
        startMonth: /^\d{4}-\d{2}$/.test(f.startMonth.value) ? f.startMonth.value : '',
        autopay: f.autopay.checked,
        memo: f.memo.value.trim(),
      };
      const list = loadBills();
      if (isNew) list.push({ id: U.uid(), paid: {}, ...data });
      else Object.assign(list.find((b) => b.id === bill.id), data);
      saveBills(list);
      dlg.close();
      onSaved();
      App.toast(isNew ? '추가했어요' : '저장했어요');
    });

    dlg.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (!confirm(`'${bill.name}'을(를) 삭제할까요? 이미 기록된 지출 내역은 남아 있어요.`)) return;
      saveBills(loadBills().filter((b) => b.id !== bill.id));
      dlg.close();
      onSaved();
      App.toast('삭제했어요');
    });
  }

  // ---------- 월 예산 ----------
  function openBudgetEditor(onSaved) {
    const dlg = App.modal('월 예산', `
      <label class="field"><span>한 달 동안 쓸 돈 (월세·고정비 포함)</span>
        <input name="budget" class="money-input" inputmode="numeric" autocomplete="off">
      </label>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>`);
    const form = dlg.querySelector('form');
    U.bindMoneyInput(form.elements.budget);
    form.elements.budget.value = settings().monthlyBudget.toLocaleString('ko-KR');
    form.elements.budget.select();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      Store.set(SETTINGS, { ...settings(), monthlyBudget: U.parseWon(form.elements.budget.value) });
      dlg.close();
      onSaved();
      App.toast('예산을 바꿨어요');
    });
  }

  // ---------- 홈 화면에 주는 정보 ----------
  // 30일 안에 낼(또는 이미 밀린) 고정 지출. 홈에서 '납부'를 누르면 여기의 납부 창이 바로 뜬다
  function deadlines() {
    return upcomingBills(30).map((x) => ({
      key: `bill:${x.bill.id}:${x.month}`,
      icon: cat(x.bill.category).icon,
      title: `${x.bill.name} 납부`,
      date: x.due,
      source: x.bill.amount ? U.won(x.bill.amount) : '가계부',
      href: '#/budget',
      actionLabel: '납부',
      complete: (onDone) => openPay(x.bill, x.month, onDone),
    }));
  }

  function stat() {
    const cur = U.monthKey(U.today());
    const s = monthSummary(cur);
    const pct = s.budget ? Math.round((s.spent / s.budget) * 100) : 0;
    return {
      icon: '💰', label: `${Number(cur.slice(5))}월 지출`, value: U.won(s.spent),
      sub: s.left >= 0 ? `남은 예산 ${U.won(s.left)}` : `${U.won(-s.left)} 초과`, pct, warn: pct > 85, href: '#/budget',
    };
  }

  App.register({ id: 'budget', title: '가계부', icon: '💰', render, api: { deadlines, stat } });
})();
