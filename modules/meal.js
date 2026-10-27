// 식단·장보기 모듈: 일주일 식단 + 단백질/칼로리 목표 + 장보기 목록 자동 정리 + 냉장고 재료
//
// 저장 데이터
//   meal.menus       메뉴 목록 [{ id, name, protein, kcal, ingredients: ['닭가슴살', ...] }]
//   meal.plan        식단 { 'YYYY-MM-DD': { breakfast: [menuId], lunch: [], dinner: [], snack: [] } }
//   meal.fridge      냉장고 [{ id, name, qty, place, expires, addedAt }]
//   meal.shopping    장보기에 직접 추가한 것 [{ id, name }]
//   meal.shopChecked 장보기에서 체크한 것 { 'ing:재료이름' 또는 'manual:id': true }
//   meal.settings    { weight, proteinPerKg, kcal }
//
// 장보기 목록 = (선택한 주 식단에 들어간 메뉴들의 재료) - (냉장고에 이미 있는 재료) + (직접 추가한 것)

(() => {
  const K = {
    menus: 'meal.menus', plan: 'meal.plan', fridge: 'meal.fridge',
    shop: 'meal.shopping', checked: 'meal.shopChecked', settings: 'meal.settings',
  };
  const SLOTS = [
    { id: 'breakfast', name: '아침', icon: '🌅' },
    { id: 'lunch', name: '점심', icon: '☀️' },
    { id: 'dinner', name: '저녁', icon: '🌙' },
    { id: 'snack', name: '간식', icon: '🍌' },
  ];
  const PLACES = ['냉장', '냉동', '실온'];

  // [이름, 단백질 g, 칼로리 kcal, 재료] — 영양값은 1인분 대략치. 메뉴 탭에서 고쳐 쓰기
  const DEFAULT_MENUS = [
    ['닭가슴살 샐러드', 30, 300, '닭가슴살, 샐러드 채소, 방울토마토, 드레싱'],
    ['계란 프라이 2개 + 밥', 15, 450, '계란, 쌀'],
    ['그릭요거트 + 바나나', 12, 250, '그릭요거트, 바나나'],
    ['프로틴 쉐이크', 24, 130, '프로틴 파우더, 우유'],
    ['제육볶음 + 밥', 28, 750, '돼지고기 앞다리살, 양파, 고추장, 쌀'],
    ['참치마요 덮밥', 22, 650, '참치캔, 마요네즈, 김, 쌀'],
    ['두부 김치찌개 + 밥', 22, 550, '두부, 김치, 돼지고기 앞다리살, 쌀'],
    ['고구마 + 우유', 9, 300, '고구마, 우유'],
    ['학식', 20, 650, ''],
    ['편의점 도시락', 18, 700, ''],
  ];

  // ---------- 데이터 ----------
  const settings = () => ({ weight: 65, proteinPerKg: 1.6, kcal: 2300, ...Store.get(K.settings, {}) });
  const targets = () => {
    const s = settings();
    return { protein: Math.round(s.weight * s.proteinPerKg), kcal: s.kcal };
  };

  const splitIngredients = (text) => String(text).split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  const norm = (s) => s.replace(/\s+/g, '').toLowerCase();

  function loadMenus() {
    let list = Store.get(K.menus);
    if (!Array.isArray(list)) {
      list = DEFAULT_MENUS.map(([name, protein, kcal, ing]) => ({
        id: U.uid(), name, protein, kcal, ingredients: splitIngredients(ing),
      }));
      Store.set(K.menus, list);
    }
    return list;
  }
  const saveMenus = (list) => Store.set(K.menus, list);
  const loadPlan = () => Store.get(K.plan, {});
  const savePlan = (p) => Store.set(K.plan, p);
  const loadFridge = () => Store.get(K.fridge, []);
  const saveFridge = (l) => Store.set(K.fridge, l);

  // 그 날 각 끼니에 들어간 메뉴 객체들 (지워진 메뉴는 건너뜀)
  function dayMeals(date) {
    const menus = loadMenus();
    const day = loadPlan()[date] || {};
    const result = {};
    SLOTS.forEach((s) => {
      result[s.id] = (day[s.id] || []).map((id) => menus.find((m) => m.id === id)).filter(Boolean);
    });
    return result;
  }

  function dayNutrition(date) {
    const all = Object.values(dayMeals(date)).flat();
    return {
      protein: U.sum(all, (m) => m.protein),
      kcal: U.sum(all, (m) => m.kcal),
      count: all.length,
    };
  }

  function addToPlan(date, slot, menuId) {
    const plan = loadPlan();
    plan[date] = plan[date] || {};
    plan[date][slot] = [...(plan[date][slot] || []), menuId];
    savePlan(plan);
  }

  function removeFromPlan(date, slot, index) {
    const plan = loadPlan();
    plan[date]?.[slot]?.splice(index, 1);
    savePlan(plan);
  }

  // 선택한 주의 식단에 필요한 재료 { key, name, count, menus }
  function weekIngredients(monday) {
    const map = new Map();
    U.weekDates(monday).forEach((d) => {
      Object.values(dayMeals(d)).flat().forEach((menu) => {
        menu.ingredients.forEach((name) => {
          const key = norm(name);
          const item = map.get(key) || { key, name, count: 0, menus: new Set() };
          item.count += 1;
          item.menus.add(menu.name);
          map.set(key, item);
        });
      });
    });
    return [...map.values()];
  }

  function fridgeLeft(item) {
    return item.expires ? U.diffDays(U.today(), U.parseDate(item.expires)) : null;
  }

  // ---------- 화면 상태 ----------
  let tab = 'plan';                         // plan | shop | fridge | menus
  let monday = U.weekStart(U.today());
  let selDate = U.fmtDate(U.today());

  function weekNavHtml() {
    const end = U.addDays(monday, 6);
    const isThisWeek = U.fmtDate(monday) === U.fmtDate(U.weekStart(U.today()));
    return `
      <div class="month-nav">
        <button type="button" class="icon-btn" data-week="-1" aria-label="지난주">‹</button>
        <b>${U.shortDate(monday)} ~ ${U.shortDate(end)}</b>
        <button type="button" class="icon-btn" data-week="1" aria-label="다음 주">›</button>
        ${isThisWeek ? '' : '<button type="button" class="btn today-btn" data-week="0">이번 주</button>'}
      </div>`;
  }

  function nutritionHtml(n, t) {
    const pPct = t.protein ? (n.protein / t.protein) * 100 : 0;
    const kPct = t.kcal ? (n.kcal / t.kcal) * 100 : 0;
    return `
      <div class="nutri-row"><span>단백질</span><span><b>${n.protein}</b> / ${t.protein} g</span></div>
      <div class="progress ${pPct >= 100 ? 'ok' : ''}"><span style="width:${Math.min(100, pPct)}%"></span></div>
      <div class="nutri-row"><span>칼로리</span><span><b>${n.kcal.toLocaleString('ko-KR')}</b> / ${t.kcal.toLocaleString('ko-KR')} kcal</span></div>
      <div class="progress ${kPct > 110 ? 'high' : ''}"><span style="width:${Math.min(100, kPct)}%"></span></div>`;
  }

  function planTabHtml() {
    const t = targets();
    const today = U.fmtDate(U.today());
    const workout = App.use('workout');
    const strip = U.weekDates(monday).map((d) => {
      const date = U.parseDate(d);
      const pct = Math.min(100, (dayNutrition(d).protein / (t.protein || 1)) * 100);
      return `
        <button type="button" class="day-btn ${d === selDate ? 'active' : ''} ${d === today ? 'today' : ''}" data-day="${d}">
          <span>${U.weekdayName(date)}</span><b>${date.getDate()}</b>
          <span class="mini-bar"><i style="width:${pct}%"></i></span>
        </button>`;
    }).join('');

    const meals = dayMeals(selDate);
    const n = dayNutrition(selDate);
    const lack = t.protein - n.protein;
    const worked = workout?.hasWorkout(selDate);

    const slots = SLOTS.map((s) => {
      const list = meals[s.id];
      return `
        <section class="card slot">
          <div class="card-head">
            <h3>${s.icon} ${s.name}</h3>
            <span class="muted small">${list.length ? `${U.sum(list, (m) => m.protein)}g · ${U.sum(list, (m) => m.kcal)}kcal` : ''}</span>
          </div>
          <div class="menu-chips">
            ${list.map((m, i) => `
              <span class="menu-chip">${U.esc(m.name)}
                <button type="button" class="x" data-remove="${s.id}:${i}" aria-label="${U.esc(m.name)} 빼기">✕</button>
              </span>`).join('')}
            <button type="button" class="add-chip" data-add-slot="${s.id}">＋ 추가</button>
          </div>
        </section>`;
    }).join('');

    const prev = U.fmtDate(U.addDays(U.parseDate(selDate), -1));
    const canCopy = !n.count && dayNutrition(prev).count;

    return `
      ${weekNavHtml()}
      <div class="day-strip">${strip}</div>
      <section class="card">
        <div class="card-head">
          <h2>${U.prettyDate(U.parseDate(selDate))} ${worked ? '<span class="tag">🏋️ 운동한 날</span>' : ''}</h2>
          <button type="button" class="link-btn" data-action="edit-goal">목표 ✎</button>
        </div>
        ${nutritionHtml(n, t)}
        <p class="hint">${n.count
          ? (lack > 0 ? `단백질이 <b>${lack}g</b> 더 필요해요${worked ? ' (운동한 날이라 특히 챙기기!)' : ''}` : '단백질 목표 달성 💪')
          : '아래에서 끼니마다 메뉴를 추가해 보세요.'}</p>
        ${canCopy ? '<button type="button" class="btn block" data-action="copy-prev">어제 식단 그대로 복사</button>' : ''}
      </section>
      ${slots}`;
  }

  function shopTabHtml() {
    const fridgeKeys = new Set(loadFridge().map((f) => norm(f.name)));
    const checked = Store.get(K.checked, {});
    const all = weekIngredients(monday);
    const need = all.filter((i) => !fridgeKeys.has(i.key)).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    const have = all.filter((i) => fridgeKeys.has(i.key));
    const manual = Store.get(K.shop, []);
    const checkedCount = need.filter((i) => checked[`ing:${i.key}`]).length + manual.filter((m) => checked[`manual:${m.id}`]).length;

    const row = (key, title, meta) => `
      <li class="check-item ${checked[key] ? 'is-done' : ''}" data-key="${U.esc(key)}">
        <label class="check" aria-label="샀음 표시">
          <input type="checkbox" data-action="shop-check" ${checked[key] ? 'checked' : ''}>
          <span class="checkmark"></span>
        </label>
        <div class="check-body" style="cursor:default">
          <span class="check-title">${U.esc(title)}</span>
          ${meta ? `<span class="check-meta">${meta}</span>` : ''}
        </div>
        ${key.startsWith('manual:') ? '<button type="button" class="row-btn" data-action="shop-remove">빼기</button>' : ''}
      </li>`;

    const rows = [
      ...need.map((i) => row(`ing:${i.key}`, i.name,
        `${U.esc([...i.menus].slice(0, 2).join(', '))}${i.menus.size > 2 ? ` 외 ${i.menus.size - 2}개` : ''} · ${i.count}회`)),
      ...manual.map((m) => row(`manual:${m.id}`, m.name, '직접 추가')),
    ].join('');

    return `
      ${weekNavHtml()}
      <section class="card">
        <div class="card-head"><h2>🛒 장보기 목록</h2><span class="muted small">${need.length + manual.length}개</span></div>
        <p class="muted small" style="margin:0">이 주 식단에 들어간 재료 중 냉장고에 없는 것만 모았어요.</p>
        <form class="inline-add" data-form="shop-add">
          <input class="input" name="name" maxlength="30" placeholder="직접 추가 (예: 휴지)" autocomplete="off">
          <button type="submit" class="btn">추가</button>
        </form>
      </section>
      ${rows ? `<ul class="checklist">${rows}</ul>` : '<div class="empty"><div class="big">🧺</div>살 게 없어요. 식단을 먼저 짜 보세요!</div>'}
      ${have.length ? `<p class="hint" style="margin:12px 4px">🧊 냉장고에 이미 있음: ${U.esc(have.map((i) => i.name).join(', '))}</p>` : ''}
      ${checkedCount ? `<button type="button" class="btn primary block" style="margin-top:12px" data-action="to-fridge">체크한 ${checkedCount}개 냉장고에 넣기</button>` : ''}`;
  }

  function fridgeTabHtml() {
    const items = loadFridge();
    if (!items.length) {
      return '<div class="empty"><div class="big">🧊</div>냉장고가 비어 있어요.<br>장보기에서 산 것을 넣거나 직접 추가하세요.</div>';
    }
    return PLACES.map((place) => {
      const list = items.filter((i) => i.place === place).sort((a, b) => {
        const la = fridgeLeft(a);
        const lb = fridgeLeft(b);
        if (la === null) return lb === null ? 0 : 1;
        if (lb === null) return -1;
        return la - lb;
      });
      if (!list.length) return '';
      return `
        <div class="group-head"><h3>${place === '냉장' ? '🧊' : place === '냉동' ? '❄️' : '🧺'} ${place}</h3><span class="meta">${list.length}개</span></div>
        <ul class="checklist">${list.map((i) => {
          const n = fridgeLeft(i);
          const cls = n === null ? '' : n < 0 ? 'due-overdue' : n <= 2 ? 'due-soon' : 'due-later';
          const exp = n === null ? '' : n < 0 ? `${-n}일 지남` : n === 0 ? '오늘까지' : `${n}일 남음`;
          return `
            <li class="check-item" data-fridge="${i.id}">
              <button type="button" class="check-body" data-action="edit-fridge" style="padding-left:14px">
                <span class="check-title">${U.esc(i.name)}${i.qty ? ` <span class="muted small">${U.esc(i.qty)}</span>` : ''}</span>
                ${exp ? `<span class="check-meta"><span class="due ${cls}">유통기한 ${U.shortDate(U.parseDate(i.expires))} · ${exp}</span></span>` : ''}
              </button>
              <button type="button" class="row-btn" data-action="used-up">다 씀</button>
            </li>`;
        }).join('')}</ul>`;
    }).join('');
  }

  function menusTabHtml() {
    const menus = loadMenus();
    return `
      <p class="muted small" style="margin:0 4px 10px">영양값은 1인분 대략치예요. 자주 먹는 메뉴를 등록해 두면 식단 짜기가 빨라져요.</p>
      <ul class="checklist">${menus.map((m) => `
        <li class="check-item" data-menu="${m.id}">
          <button type="button" class="check-body" data-action="edit-menu" style="padding-left:14px">
            <span class="check-title">${U.esc(m.name)}</span>
            <span class="check-meta"><span>단백질 ${m.protein}g</span><span>${m.kcal}kcal</span></span>
            ${m.ingredients.length ? `<span class="check-memo">${U.esc(m.ingredients.join(', '))}</span>` : ''}
          </button>
        </li>`).join('')}
      </ul>`;
  }

  function paint(root) {
    const tabBtn = (id, label) => `<button type="button" class="${tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`;
    const body = { plan: planTabHtml, shop: shopTabHtml, fridge: fridgeTabHtml, menus: menusTabHtml }[tab]();
    const fab = { fridge: ['add-fridge', '＋ 재료 추가'], menus: ['add-menu', '＋ 메뉴 추가'] }[tab];
    root.innerHTML = `
      <div class="seg">${tabBtn('plan', '식단')}${tabBtn('shop', '장보기')}${tabBtn('fridge', '냉장고')}${tabBtn('menus', '메뉴')}</div>
      ${body}
      ${fab ? `<button type="button" class="fab" data-action="${fab[0]}">${fab[1]}</button>` : ''}`;
  }

  function render(el) {
    const root = document.createElement('div');
    el.appendChild(root);
    const repaint = () => paint(root);

    root.addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const d = t.dataset;
      if (d.tab) { tab = d.tab; repaint(); return; }
      if (d.week !== undefined) {
        const n = Number(d.week);
        monday = n === 0 ? U.weekStart(U.today()) : U.addDays(monday, n * 7);
        // 고른 날짜도 같은 요일로 따라 옮긴다
        const offset = (U.parseDate(selDate).getDay() + 6) % 7;
        selDate = n === 0 ? U.fmtDate(U.today()) : U.fmtDate(U.addDays(monday, offset));
        repaint();
        return;
      }
      if (d.day) { selDate = d.day; repaint(); return; }
      if (d.addSlot) { openPicker(selDate, d.addSlot, repaint); return; }
      if (d.remove) {
        const [slot, i] = d.remove.split(':');
        removeFromPlan(selDate, slot, Number(i));
        repaint();
        return;
      }
      const item = (attr) => t.closest(`[data-${attr}]`)?.dataset[attr];
      switch (d.action) {
        case 'edit-goal': openGoalEditor(repaint); break;
        case 'copy-prev': {
          const plan = loadPlan();
          const prev = U.fmtDate(U.addDays(U.parseDate(selDate), -1));
          plan[selDate] = JSON.parse(JSON.stringify(plan[prev] || {}));
          savePlan(plan);
          repaint();
          App.toast('어제 식단을 복사했어요');
          break;
        }
        case 'shop-remove': {
          const id = item('key').slice('manual:'.length);
          Store.set(K.shop, Store.get(K.shop, []).filter((m) => m.id !== id));
          repaint();
          break;
        }
        case 'to-fridge': moveCheckedToFridge(); repaint(); break;
        case 'add-fridge': openFridgeEditor(null, repaint); break;
        case 'edit-fridge': openFridgeEditor(loadFridge().find((f) => f.id === item('fridge')), repaint); break;
        case 'used-up': {
          const before = loadFridge();
          const gone = before.find((f) => f.id === item('fridge'));
          saveFridge(before.filter((f) => f !== gone));
          repaint();
          App.toast(`${gone.name} 다 썼어요`, { label: '되돌리기', onClick: () => { saveFridge(before); repaint(); } });
          break;
        }
        case 'add-menu': openMenuEditor(null, repaint); break;
        case 'edit-menu': openMenuEditor(loadMenus().find((m) => m.id === item('menu')), repaint); break;
        default:
      }
    });

    root.addEventListener('change', (e) => {
      if (e.target.dataset.action !== 'shop-check') return;
      const key = e.target.closest('[data-key]').dataset.key;
      const checked = Store.get(K.checked, {});
      if (e.target.checked) checked[key] = true;
      else delete checked[key];
      Store.set(K.checked, checked);
      repaint();
    });

    root.addEventListener('submit', (e) => {
      if (e.target.dataset.form !== 'shop-add') return;
      e.preventDefault();
      const name = e.target.elements.name.value.trim();
      if (!name) return;
      Store.set(K.shop, [...Store.get(K.shop, []), { id: U.uid(), name }]);
      repaint();
      root.querySelector('[data-form="shop-add"] input').focus();
    });

    repaint();
  }

  // 장보기에서 체크한 것 → 냉장고로 옮기고 체크 풀기
  function moveCheckedToFridge() {
    const checked = Store.get(K.checked, {});
    const names = [];
    weekIngredients(monday).forEach((i) => { if (checked[`ing:${i.key}`]) names.push(i.name); });
    const manual = Store.get(K.shop, []);
    manual.forEach((m) => { if (checked[`manual:${m.id}`]) names.push(m.name); });

    const today = U.fmtDate(U.today());
    saveFridge([...loadFridge(), ...names.map((name) => ({
      id: U.uid(), name, qty: '', place: '냉장', expires: null, addedAt: today,
    }))]);
    Store.set(K.shop, manual.filter((m) => !checked[`manual:${m.id}`]));
    Store.set(K.checked, {});
    App.toast(`🧊 ${names.length}개를 냉장고에 넣었어요`);
  }

  // ---------- 메뉴 고르기 창 ----------
  function openPicker(date, slotId, onDone) {
    const slot = SLOTS.find((s) => s.id === slotId);
    const dlg = App.modal(`${slot.icon} ${slot.name}에 추가`, `
      <input class="input" data-search placeholder="메뉴 검색" autocomplete="off">
      <ul class="pick-list" data-list></ul>
      <div class="modal-actions"><button type="button" class="btn block" data-new>＋ 새 메뉴 만들기</button></div>`);
    const search = dlg.querySelector('[data-search]');
    const listEl = dlg.querySelector('[data-list]');

    function draw() {
      const q = norm(search.value);
      const menus = loadMenus().filter((m) => !q || norm(m.name).includes(q));
      listEl.innerHTML = menus.map((m) => `
        <li><button type="button" data-menu="${m.id}">
          <span>${U.esc(m.name)}</span><span class="muted small">${m.protein}g · ${m.kcal}kcal</span>
        </button></li>`).join('') || '<li class="muted small" style="padding:12px 4px">검색 결과가 없어요. 새 메뉴로 만들어 보세요.</li>';
    }
    search.addEventListener('input', draw);
    dlg.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
    listEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-menu]');
      if (!b) return;
      addToPlan(date, slotId, b.dataset.menu);
      dlg.close();
      onDone();
    });
    dlg.querySelector('[data-new]').addEventListener('click', () => {
      const name = search.value.trim();
      dlg.close();
      openMenuEditor(null, onDone, { name, onCreate: (menu) => addToPlan(date, slotId, menu.id) });
    });
    draw();
  }

  // ---------- 메뉴 추가/수정 ----------
  function openMenuEditor(menu, onSaved, opts = {}) {
    const isNew = !menu;
    const current = menu || { name: opts.name || '', protein: '', kcal: '', ingredients: [] };
    const dlg = App.modal(isNew ? '새 메뉴' : '메뉴 수정', `
      <label class="field"><span>메뉴 이름</span><input name="name" maxlength="30" autocomplete="off" placeholder="예: 닭가슴살 볶음밥"></label>
      <div class="row">
        <label class="field"><span>단백질 (g)</span><input name="protein" type="number" min="0" max="300" inputmode="numeric"></label>
        <label class="field"><span>칼로리 (kcal)</span><input name="kcal" type="number" min="0" max="5000" inputmode="numeric"></label>
      </div>
      <label class="field"><span>재료 (쉼표로 구분 — 장보기 목록에 쓰여요)</span>
        <textarea name="ingredients" rows="2" placeholder="예: 닭가슴살, 양파, 쌀"></textarea>
      </label>
      <small class="hint">모르면 비워 둬도 돼요. 포장지 영양성분표나 검색으로 대략 넣으면 충분해요.</small>
      <small class="hint error" data-error></small>
      <div class="modal-actions">
        ${isNew ? '' : '<button type="button" class="btn danger" data-delete>삭제</button>'}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>`);
    const form = dlg.querySelector('form');
    const f = form.elements;
    f.name.value = current.name;
    f.protein.value = current.protein;
    f.kcal.value = current.kcal;
    f.ingredients.value = current.ingredients.join(', ');
    if (isNew) f.name.focus();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = f.name.value.trim();
      if (!name) { dlg.querySelector('[data-error]').textContent = '메뉴 이름을 입력해 주세요.'; return; }
      const data = {
        name,
        protein: Math.max(0, parseInt(f.protein.value, 10) || 0),
        kcal: Math.max(0, parseInt(f.kcal.value, 10) || 0),
        ingredients: splitIngredients(f.ingredients.value),
      };
      const list = loadMenus();
      let saved;
      if (isNew) {
        saved = { id: U.uid(), ...data };
        list.push(saved);
      } else {
        saved = Object.assign(list.find((m) => m.id === menu.id), data);
      }
      saveMenus(list);
      opts.onCreate?.(saved);
      dlg.close();
      onSaved();
      App.toast(isNew ? '메뉴를 추가했어요' : '저장했어요');
    });

    dlg.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (!confirm(`'${menu.name}' 메뉴를 삭제할까요? 식단에 넣어 둔 것도 함께 빠져요.`)) return;
      saveMenus(loadMenus().filter((m) => m.id !== menu.id));
      dlg.close();
      onSaved();
      App.toast('삭제했어요');
    });
  }

  // ---------- 냉장고 재료 추가/수정 ----------
  function openFridgeEditor(item, onSaved) {
    const isNew = !item;
    const current = item || { name: '', qty: '', place: '냉장', expires: null };
    const dlg = App.modal(isNew ? '재료 추가' : '재료 수정', `
      <div class="row">
        <label class="field"><span>재료</span><input name="name" maxlength="30" autocomplete="off" placeholder="예: 계란"></label>
        <label class="field"><span>양 (선택)</span><input name="qty" maxlength="15" autocomplete="off" placeholder="예: 10개"></label>
      </div>
      <div class="row">
        <label class="field"><span>보관</span><select name="place">${PLACES.map((p) => `<option>${p}</option>`).join('')}</select></label>
        <label class="field"><span>유통기한 (선택)</span><input name="expires" type="date"></label>
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
    f.name.value = current.name;
    f.qty.value = current.qty || '';
    f.place.value = current.place;
    f.expires.value = current.expires || '';
    if (isNew) f.name.focus();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = f.name.value.trim();
      if (!name) { dlg.querySelector('[data-error]').textContent = '재료 이름을 입력해 주세요.'; return; }
      const data = { name, qty: f.qty.value.trim(), place: f.place.value, expires: f.expires.value || null };
      const list = loadFridge();
      if (isNew) list.push({ id: U.uid(), addedAt: U.fmtDate(U.today()), ...data });
      else Object.assign(list.find((x) => x.id === item.id), data);
      saveFridge(list);
      dlg.close();
      onSaved();
    });

    dlg.querySelector('[data-delete]')?.addEventListener('click', () => {
      saveFridge(loadFridge().filter((x) => x.id !== item.id));
      dlg.close();
      onSaved();
    });
  }

  // ---------- 영양 목표 ----------
  function openGoalEditor(onSaved) {
    const s = settings();
    const dlg = App.modal('영양 목표', `
      <div class="row">
        <label class="field"><span>체중 (kg)</span><input name="weight" type="number" min="30" max="200" step="0.1" inputmode="decimal"></label>
        <label class="field"><span>체중 1kg당 단백질</span>
          <select name="perKg">
            <option value="1.2">1.2g (가벼운 운동)</option>
            <option value="1.6">1.6g (근력 운동)</option>
            <option value="2">2.0g (벌크업)</option>
          </select>
        </label>
      </div>
      <label class="field"><span>하루 칼로리 목표 (kcal)</span><input name="kcal" type="number" min="1000" max="6000" step="50" inputmode="numeric"></label>
      <p class="hint" data-preview></p>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>`);
    const form = dlg.querySelector('form');
    const f = form.elements;
    f.weight.value = s.weight;
    f.perKg.value = String(s.proteinPerKg);
    f.kcal.value = s.kcal;
    const update = () => {
      const p = Math.round((parseFloat(f.weight.value) || 0) * parseFloat(f.perKg.value));
      dlg.querySelector('[data-preview]').textContent = `→ 하루 단백질 목표 ${p}g`;
    };
    form.addEventListener('input', update);
    update();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      Store.set(K.settings, {
        weight: parseFloat(f.weight.value) || s.weight,
        proteinPerKg: parseFloat(f.perKg.value),
        kcal: parseInt(f.kcal.value, 10) || s.kcal,
      });
      dlg.close();
      onSaved();
      App.toast('목표를 바꿨어요');
    });
  }

  // ---------- 홈 화면 카드: 오늘 끼니별 메뉴 ----------
  function widget(el) {
    const today = U.fmtDate(U.today());
    const meals = dayMeals(today);
    const planned = Object.values(meals).flat().length;
    el.innerHTML = `
      <section class="card">
        <div class="card-head"><h3>🍚 오늘 식단</h3><a class="card-link" href="#/meal">식단 ›</a></div>
        ${planned ? `<ul class="mini-list" style="margin:0">${SLOTS.map((s) => `
          <li><span>${s.icon} ${s.name}</span>
          <span class="${meals[s.id].length ? '' : 'muted'}">${meals[s.id].length ? U.esc(meals[s.id].map((m) => m.name).join(', ')) : '—'}</span></li>`).join('')}
        </ul>` : '<p class="muted small" style="margin:0">오늘 식단이 비어 있어요. 식단 탭에서 끼니를 채워 보세요.</p>'}
      </section>`;
  }

  // 유통기한이 3일 안으로 남은(또는 지난) 재료 → 홈의 오늘 할 일 / D-day
  function deadlines() {
    return loadFridge()
      .filter((i) => { const n = fridgeLeft(i); return n !== null && n <= 3; })
      .map((i) => ({
        key: `fridge:${i.id}`,
        icon: '🧊',
        title: `${i.name} 유통기한`,
        date: U.parseDate(i.expires),
        source: `${i.place} 보관`,
        href: '#/meal',
        actionLabel: '다 씀',
        complete(onDone) {
          const before = loadFridge();
          saveFridge(before.filter((x) => x.id !== i.id));
          onDone();
          App.toast(`${i.name} 다 썼어요`, { label: '되돌리기', onClick: () => { saveFridge(before); onDone(); } });
        },
      }));
  }

  function stat() {
    const n = dayNutrition(U.fmtDate(U.today()));
    const t = targets();
    const pct = t.protein ? Math.round((n.protein / t.protein) * 100) : 0;
    return {
      icon: '🍗', label: '오늘 단백질', value: `${n.protein}g`,
      sub: `목표 ${t.protein}g · ${n.kcal.toLocaleString('ko-KR')}kcal`, pct, good: pct >= 100, href: '#/meal',
    };
  }

  App.register({
    id: 'meal', title: '식단', icon: '🍚', render, widget,
    api: { dayNutrition, targets, deadlines, stat },
  });
})();
