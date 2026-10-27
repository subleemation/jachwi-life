// 운동 기록 모듈: 날짜별 종목·세트(무게×횟수) 기록, 주간 볼륨, 종목별 성장 그래프
//
// 저장 데이터
//   workout.exercises 종목 [{ id, name, part }]
//   workout.logs      기록 [{ id, date:'YYYY-MM-DD', exerciseId, sets: [{ w: 60, r: 10 }], memo }]
//
// 볼륨 = 무게 × 횟수의 합 (맨몸 운동처럼 무게가 0이면 볼륨에는 안 들어가고 횟수만 표시)
// 추정 1RM = 무게 × (1 + 횟수 / 30)  (Epley 공식, 한 번에 들 수 있는 최대 무게 추정)

(() => {
  const EXS = 'workout.exercises';
  const LOGS = 'workout.logs';
  const PARTS = ['가슴', '등', '하체', '어깨', '팔', '코어', '기타'];
  const DEFAULT_EXERCISES = [
    ['벤치프레스', '가슴'], ['인클라인 덤벨프레스', '가슴'], ['푸시업', '가슴'],
    ['데드리프트', '등'], ['랫풀다운', '등'], ['바벨로우', '등'], ['풀업', '등'],
    ['스쿼트', '하체'], ['레그프레스', '하체'], ['런지', '하체'],
    ['오버헤드프레스', '어깨'], ['사이드 레터럴 레이즈', '어깨'],
    ['바벨 컬', '팔'], ['트라이셉스 푸시다운', '팔'],
    ['크런치', '코어'],
  ];

  // ---------- 데이터 ----------
  function loadExercises() {
    let list = Store.get(EXS);
    if (!Array.isArray(list)) {
      list = DEFAULT_EXERCISES.map(([name, part]) => ({ id: U.uid(), name, part }));
      Store.set(EXS, list);
    }
    return list;
  }
  const saveExercises = (l) => Store.set(EXS, l);
  const loadLogs = () => Store.get(LOGS, []);
  const saveLogs = (l) => Store.set(LOGS, l);
  const exercise = (id) => loadExercises().find((x) => x.id === id) || { id, name: '(삭제된 종목)', part: '기타' };

  const volume = (log) => U.sum(log.sets, (s) => s.w * s.r);
  const e1rm = (s) => (s.w > 0 && s.r > 0 ? s.w * (1 + s.r / 30) : 0);
  const bestE1rm = (log) => Math.max(0, ...log.sets.map(e1rm));
  const fmtKg = (n) => `${Math.round(n * 10) / 10}`;
  const setText = (s) => (s.w > 0 ? `${fmtKg(s.w)}kg × ${s.r}` : `${s.r}회`);

  const logsOn = (date) => loadLogs().filter((l) => l.date === date);
  const hasWorkout = (date) => loadLogs().some((l) => l.date === date);

  function weekSummary(monday, part = '') {
    const dates = new Set(U.weekDates(monday));
    const logs = loadLogs().filter((l) => dates.has(l.date) && (!part || exercise(l.exerciseId).part === part));
    return {
      days: new Set(logs.map((l) => l.date)).size,
      volume: U.sum(logs, volume),
      sets: U.sum(logs, (l) => l.sets.length),
    };
  }

  // 이 종목의 가장 최근 기록 (before 날짜보다 앞선 것)
  function lastLogOf(exerciseId, before) {
    return loadLogs()
      .filter((l) => l.exerciseId === exerciseId && l.date < before)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  }

  // ---------- 화면 상태 ----------
  let tab = 'log';                             // log | stats | exercises
  let selDate = U.fmtDate(U.today());
  let statPart = '';
  let statExercise = '';

  function stripHtml() {
    const monday = U.weekStart(U.parseDate(selDate));
    const today = U.fmtDate(U.today());
    const isThisWeek = U.fmtDate(monday) === U.fmtDate(U.weekStart(U.today()));
    return `
      <div class="month-nav">
        <button type="button" class="icon-btn" data-week="-1" aria-label="지난주">‹</button>
        <b>${U.shortDate(monday)} ~ ${U.shortDate(U.addDays(monday, 6))}</b>
        <button type="button" class="icon-btn" data-week="1" aria-label="다음 주">›</button>
        ${isThisWeek ? '' : '<button type="button" class="btn today-btn" data-week="0">이번 주</button>'}
      </div>
      <div class="day-strip">${U.weekDates(monday).map((d) => {
        const date = U.parseDate(d);
        return `
          <button type="button" class="day-btn ${d === selDate ? 'active' : ''} ${d === today ? 'today' : ''}" data-day="${d}">
            <span>${U.weekdayName(date)}</span><b>${date.getDate()}</b>
            <span class="day-dot ${hasWorkout(d) ? '' : 'empty'}"></span>
          </button>`;
      }).join('')}</div>`;
  }

  function logTabHtml() {
    const monday = U.weekStart(U.parseDate(selDate));
    const w = weekSummary(monday);
    const prev = weekSummary(U.addDays(monday, -7));
    const diff = prev.volume ? Math.round(((w.volume - prev.volume) / prev.volume) * 100) : null;
    const logs = logsOn(selDate);
    const meal = App.use('meal');
    const n = meal?.dayNutrition(selDate);
    const t = meal?.targets();

    const cards = logs.map((l) => {
      const ex = exercise(l.exerciseId);
      const v = volume(l);
      return `
        <section class="card" data-log="${l.id}" style="padding:0">
          <button type="button" class="check-body" data-action="edit-log" style="padding:14px 16px">
            <span class="card-head" style="margin:0;width:100%">
              <span class="check-title">${U.esc(ex.name)} <span class="badge">${ex.part}</span></span>
              <span class="muted small">${v ? `볼륨 ${v.toLocaleString('ko-KR')}kg` : `${U.sum(l.sets, (s) => s.r)}회`}</span>
            </span>
            <ul class="set-lines">${l.sets.map((s, i) => `<li><span class="n">${i + 1}세트</span><span>${setText(s)}</span></li>`).join('')}</ul>
            ${l.memo ? `<span class="check-memo">${U.esc(l.memo)}</span>` : ''}
          </button>
        </section>`;
    }).join('');

    return `
      <section class="card">
        <div class="card-head"><h2>이번 주</h2><span class="muted small">${U.shortDate(monday)} 시작</span></div>
        <div class="stats">
          <div class="stat"><b>${w.days}일</b><span>운동한 날</span></div>
          <div class="stat"><b>${w.sets}</b><span>총 세트</span></div>
          <div class="stat"><b>${Math.round(w.volume / 100) / 10}t</b><span>볼륨${diff === null ? '' : ` <span class="${diff >= 0 ? 'pos' : 'neg'}">${diff >= 0 ? '+' : ''}${diff}%</span>`}</span></div>
        </div>
      </section>
      ${stripHtml()}
      <div class="group-head">
        <h3>${U.prettyDate(U.parseDate(selDate))}</h3>
        ${n && t ? `<span class="meta">단백질 계획 ${n.protein} / ${t.protein}g</span>` : ''}
      </div>
      ${cards || '<div class="empty"><div class="big">🏋️</div>이 날 운동 기록이 없어요.</div>'}`;
  }

  // 간단한 꺾은선 그래프 (SVG)
  function lineChart(points) {
    if (points.length < 2) return '<p class="muted small" style="margin:0">기록이 2번 이상 쌓이면 그래프가 그려져요.</p>';
    const W = 320; const H = 160;
    const P = { l: 34, r: 14, t: 26, b: 22 };   // 위쪽 여백은 마지막 값 글자가 잘리지 않게 넉넉히
    const vals = points.map((p) => p.value);
    let min = Math.min(...vals); let max = Math.max(...vals);
    if (max - min < 5) { min -= 2.5; max += 2.5; }
    const x = (i) => P.l + (i * (W - P.l - P.r)) / (points.length - 1);
    const y = (v) => P.t + (1 - (v - min) / (max - min)) * (H - P.t - P.b);
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    return `
      <svg class="line-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="추정 1RM 변화">
        <line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(max)}" y2="${y(max)}"/>
        <line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${y(min)}" y2="${y(min)}"/>
        <text x="${P.l - 6}" y="${y(max) + 3}" text-anchor="end">${Math.round(max)}</text>
        <text x="${P.l - 6}" y="${y(min) + 3}" text-anchor="end">${Math.round(min)}</text>
        <path class="line" d="${d}"/>
        ${points.map((p, i) => `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="3.5"/>`).join('')}
        <text class="last" x="${x(points.length - 1)}" y="${y(last.value) - 8}" text-anchor="end">${fmtKg(last.value)}kg</text>
        <text x="${P.l}" y="${H - 6}">${points[0].label}</text>
        <text x="${W - P.r}" y="${H - 6}" text-anchor="end">${last.label}</text>
      </svg>`;
  }

  function statsTabHtml() {
    const logs = loadLogs();
    if (!logs.length) return '<div class="empty"><div class="big">📈</div>운동을 기록하면 여기서 성장 그래프를 볼 수 있어요.</div>';

    // 주간 볼륨 (최근 8주)
    const thisMonday = U.weekStart(U.today());
    const weeks = [-7, -6, -5, -4, -3, -2, -1, 0].map((n) => U.addDays(thisMonday, n * 7));
    const vols = weeks.map((m) => weekSummary(m, statPart).volume);
    const top = Math.max(...vols, 1);
    const short = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10}t` : v ? `${v}` : '');
    const usedParts = PARTS.filter((p) => logs.some((l) => exercise(l.exerciseId).part === p));
    const chip = (value, label) => `<button type="button" class="chip ${statPart === value ? 'active' : ''}" data-part="${value}">${label}</button>`;

    // 종목별 성장
    const usedEx = loadExercises().filter((ex) => logs.some((l) => l.exerciseId === ex.id && bestE1rm(l) > 0));
    if (!usedEx.some((ex) => ex.id === statExercise)) statExercise = usedEx[0]?.id || '';
    const exLogs = logs.filter((l) => l.exerciseId === statExercise).sort((a, b) => (a.date < b.date ? -1 : 1));
    const points = exLogs.map((l) => ({ label: U.shortDate(U.parseDate(l.date)), value: bestE1rm(l) })).slice(-12);
    const allSets = exLogs.flatMap((l) => l.sets.filter((s) => s.w > 0));
    const heaviest = allSets.sort((a, b) => b.w - a.w || b.r - a.r)[0];
    const best = Math.max(0, ...exLogs.map(bestE1rm));

    return `
      <section class="card">
        <div class="card-head"><h2>주간 볼륨</h2><span class="muted small">최근 8주 · 무게×횟수</span></div>
        <div class="chips">${chip('', '전체')}${usedParts.map((p) => chip(p, p)).join('')}</div>
        <div class="trend">
          ${weeks.map((m, i) => `
            <div class="trend-col ${i === weeks.length - 1 ? 'current' : ''}">
              <span class="trend-val">${short(vols[i])}</span>
              <div class="trend-bar" style="height:${(vols[i] / top) * 88}px"></div>
              <span class="trend-label">${U.shortDate(m)}</span>
            </div>`).join('')}
        </div>
      </section>
      <section class="card">
        <div class="card-head"><h2>종목별 성장</h2></div>
        ${usedEx.length ? `
          <select class="input" data-stat-ex style="margin-bottom:12px">
            ${usedEx.map((ex) => `<option value="${ex.id}" ${ex.id === statExercise ? 'selected' : ''}>${U.esc(ex.name)}</option>`).join('')}
          </select>
          <div class="stats" style="margin:0 0 12px">
            <div class="stat"><b>${heaviest ? `${fmtKg(heaviest.w)}kg` : '-'}</b><span>최고 무게${heaviest ? ` ×${heaviest.r}` : ''}</span></div>
            <div class="stat"><b>${fmtKg(best)}kg</b><span>추정 1RM</span></div>
            <div class="stat"><b>${exLogs.length}회</b><span>기록 횟수</span></div>
          </div>
          ${lineChart(points)}
          <p class="hint">추정 1RM = 그날 가장 좋은 세트로 계산한 "1번 들 수 있는 최대 무게" 추정치예요.</p>`
          : '<p class="muted small" style="margin:0">무게를 넣은 기록이 있어야 그래프를 그릴 수 있어요.</p>'}
      </section>`;
  }

  function exercisesTabHtml() {
    const list = loadExercises();
    return PARTS.map((part) => {
      const items = list.filter((x) => x.part === part);
      if (!items.length) return '';
      return `
        <div class="group-head"><h3>${part}</h3><span class="meta">${items.length}개</span></div>
        <ul class="checklist">${items.map((x) => `
          <li class="check-item" data-ex="${x.id}">
            <button type="button" class="check-body" data-action="edit-ex" style="padding-left:14px">
              <span class="check-title">${U.esc(x.name)}</span>
            </button>
          </li>`).join('')}</ul>`;
    }).join('');
  }

  function paint(root) {
    const tabBtn = (id, label) => `<button type="button" class="${tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`;
    const body = { log: logTabHtml, stats: statsTabHtml, exercises: exercisesTabHtml }[tab]();
    const fab = { log: ['add-log', '＋ 운동 추가'], exercises: ['add-ex', '＋ 종목 추가'] }[tab];
    root.innerHTML = `
      <div class="seg">${tabBtn('log', '기록')}${tabBtn('stats', '통계')}${tabBtn('exercises', '종목')}</div>
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
        selDate = U.fmtDate(n === 0 ? U.today() : U.addDays(U.parseDate(selDate), n * 7));
        repaint();
        return;
      }
      if (d.day) { selDate = d.day; repaint(); return; }
      if (d.part !== undefined) { statPart = d.part; repaint(); return; }
      switch (d.action) {
        case 'add-log': openLogEditor(null, repaint); break;
        case 'edit-log': openLogEditor(loadLogs().find((l) => l.id === t.closest('[data-log]').dataset.log), repaint); break;
        case 'add-ex': openExerciseEditor(null, repaint); break;
        case 'edit-ex': openExerciseEditor(loadExercises().find((x) => x.id === t.closest('[data-ex]').dataset.ex), repaint); break;
        default:
      }
    });

    root.addEventListener('change', (e) => {
      if (e.target.matches('[data-stat-ex]')) { statExercise = e.target.value; repaint(); }
    });

    repaint();
  }

  // ---------- 운동 기록 추가/수정 ----------
  function openLogEditor(log, onSaved) {
    const isNew = !log;
    const exercises = loadExercises();
    const current = log || { date: selDate, exerciseId: exercises[0]?.id, sets: [], memo: '' };
    const options = PARTS.map((p) => {
      const items = exercises.filter((x) => x.part === p);
      return items.length ? `<optgroup label="${p}">${items.map((x) => `<option value="${x.id}">${U.esc(x.name)}</option>`).join('')}</optgroup>` : '';
    }).join('');

    const dlg = App.modal(isNew ? '운동 추가' : '운동 수정', `
      <div class="row">
        <label class="field" style="flex:2"><span>종목</span>
          <select name="exercise">${options}<option value="__new">＋ 새 종목…</option></select>
        </label>
        <label class="field"><span>날짜</span><input name="date" type="date"></label>
      </div>
      <div class="row" data-new-ex hidden>
        <label class="field" style="flex:2"><span>새 종목 이름</span><input name="newName" maxlength="30" autocomplete="off"></label>
        <label class="field"><span>부위</span><select name="newPart">${PARTS.map((p) => `<option>${p}</option>`).join('')}</select></label>
      </div>
      <div class="field">
        <span class="field-label">세트</span>
        <div class="set-head"><span></span><span>무게 (kg)</span><span>횟수</span><span></span></div>
        <div data-sets></div>
        <button type="button" class="btn block" data-add-set>＋ 세트 추가</button>
        <small class="hint" data-last></small>
      </div>
      <label class="field"><span>메모 (선택)</span><input name="memo" maxlength="60" autocomplete="off" placeholder="예: 마지막 세트 힘들었음"></label>
      <small class="hint">맨몸 운동은 무게를 0으로 두면 횟수만 기록돼요.</small>
      <small class="hint error" data-error></small>
      <div class="modal-actions">
        ${isNew ? '' : '<button type="button" class="btn danger" data-delete>삭제</button>'}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>`);

    const form = dlg.querySelector('form');
    const f = form.elements;
    const setsEl = dlg.querySelector('[data-sets]');
    f.exercise.value = current.exerciseId;
    f.date.value = current.date;
    f.memo.value = current.memo || '';

    // 세트 입력줄: 화면의 입력값을 배열로 읽고, 배열로 다시 그린다
    let sets = current.sets.map((s) => ({ ...s }));
    let touched = !isNew;
    const readSets = () => [...setsEl.querySelectorAll('.set-row')].map((row) => ({
      w: row.querySelector('[data-w]').value,
      r: row.querySelector('[data-r]').value,
    }));
    const drawSets = () => {
      setsEl.innerHTML = sets.map((s, i) => `
        <div class="set-row">
          <span class="n">${i + 1}</span>
          <input class="input" data-w type="number" min="0" step="0.5" inputmode="decimal" value="${s.w ?? ''}" aria-label="${i + 1}세트 무게">
          <input class="input" data-r type="number" min="0" step="1" inputmode="numeric" value="${s.r ?? ''}" aria-label="${i + 1}세트 횟수">
          <button type="button" class="icon-btn" data-del-set="${i}" aria-label="${i + 1}세트 삭제">✕</button>
        </div>`).join('');
    };

    // 종목을 고르면 지난번 기록을 보여주고, 새 기록이면 그 세트를 미리 채워준다
    const onExerciseChange = () => {
      const isNewEx = f.exercise.value === '__new';
      dlg.querySelector('[data-new-ex]').hidden = !isNewEx;
      const last = isNewEx ? null : lastLogOf(f.exercise.value, f.date.value || selDate);
      dlg.querySelector('[data-last]').textContent = last
        ? `지난번 ${U.shortDate(U.parseDate(last.date))}: ${last.sets.map(setText).join(', ')}`
        : '';
      if (!touched) {
        sets = last ? last.sets.map((s) => ({ ...s })) : [{ w: '', r: '' }, { w: '', r: '' }, { w: '', r: '' }];
        drawSets();
      }
    };
    f.exercise.addEventListener('change', onExerciseChange);
    setsEl.addEventListener('input', () => { touched = true; });
    dlg.querySelector('[data-add-set]').addEventListener('click', () => {
      sets = readSets();
      const lastSet = sets[sets.length - 1] || { w: '', r: '' };
      sets.push({ ...lastSet });
      touched = true;
      drawSets();
      setsEl.querySelector('.set-row:last-child [data-r]').focus();
    });
    setsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-del-set]');
      if (!b) return;
      sets = readSets();
      sets.splice(Number(b.dataset.delSet), 1);
      touched = true;
      drawSets();
    });
    drawSets();
    onExerciseChange();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const error = dlg.querySelector('[data-error]');
      let exerciseId = f.exercise.value;
      if (exerciseId === '__new') {
        const name = f.newName.value.trim();
        if (!name) { error.textContent = '새 종목 이름을 입력해 주세요.'; f.newName.focus(); return; }
        const ex = { id: U.uid(), name, part: f.newPart.value };
        saveExercises([...loadExercises(), ex]);
        exerciseId = ex.id;
      }
      const cleaned = readSets()
        .map((s) => ({ w: Math.max(0, parseFloat(s.w) || 0), r: Math.max(0, parseInt(s.r, 10) || 0) }))
        .filter((s) => s.r > 0);
      if (!cleaned.length) { error.textContent = '횟수를 입력한 세트가 하나 이상 있어야 해요.'; return; }
      if (!f.date.value) { error.textContent = '날짜를 골라 주세요.'; return; }

      const data = { date: f.date.value, exerciseId, sets: cleaned, memo: f.memo.value.trim() };
      const list = loadLogs();
      if (isNew) list.push({ id: U.uid(), ...data });
      else Object.assign(list.find((l) => l.id === log.id), data);
      saveLogs(list);
      selDate = data.date;
      dlg.close();
      onSaved();
      App.toast(isNew ? '💪 기록했어요' : '저장했어요');
    });

    dlg.querySelector('[data-delete]')?.addEventListener('click', () => {
      if (!confirm('이 운동 기록을 삭제할까요?')) return;
      saveLogs(loadLogs().filter((l) => l.id !== log.id));
      dlg.close();
      onSaved();
      App.toast('삭제했어요');
    });
  }

  // ---------- 종목 추가/수정 ----------
  function openExerciseEditor(ex, onSaved) {
    const isNew = !ex;
    const current = ex || { name: '', part: '가슴' };
    const dlg = App.modal(isNew ? '종목 추가' : '종목 수정', `
      <div class="row">
        <label class="field" style="flex:2"><span>이름</span><input name="name" maxlength="30" autocomplete="off"></label>
        <label class="field"><span>부위</span><select name="part">${PARTS.map((p) => `<option>${p}</option>`).join('')}</select></label>
      </div>
      <small class="hint error" data-error></small>
      <div class="modal-actions">
        ${isNew ? '' : '<button type="button" class="btn danger" data-delete>삭제</button>'}
        <span class="spacer"></span>
        <button type="button" class="btn" data-close>취소</button>
        <button type="submit" class="btn primary">저장</button>
      </div>`);
    const form = dlg.querySelector('form');
    form.elements.name.value = current.name;
    form.elements.part.value = current.part;
    if (isNew) form.elements.name.focus();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = form.elements.name.value.trim();
      if (!name) { dlg.querySelector('[data-error]').textContent = '이름을 입력해 주세요.'; return; }
      const list = loadExercises();
      if (isNew) list.push({ id: U.uid(), name, part: form.elements.part.value });
      else Object.assign(list.find((x) => x.id === ex.id), { name, part: form.elements.part.value });
      saveExercises(list);
      dlg.close();
      onSaved();
    });

    dlg.querySelector('[data-delete]')?.addEventListener('click', () => {
      const count = loadLogs().filter((l) => l.exerciseId === ex.id).length;
      const msg = count
        ? `'${ex.name}' 종목을 삭제할까요? 기록 ${count}개는 남지만 '(삭제된 종목)'으로 표시돼요.`
        : `'${ex.name}' 종목을 삭제할까요?`;
      if (!confirm(msg)) return;
      saveExercises(loadExercises().filter((x) => x.id !== ex.id));
      dlg.close();
      onSaved();
    });
  }

  // ---------- 홈 화면 카드: 오늘 한 운동 ----------
  function widget(el) {
    const today = U.fmtDate(U.today());
    const todays = logsOn(today);
    const monday = U.weekStart(U.today());
    const dots = U.weekDates(monday).map((d) => `
      <span class="week-dot ${hasWorkout(d) ? 'on' : ''} ${d === today ? 'today' : ''}">${U.weekdayName(U.parseDate(d))}</span>`).join('');
    el.innerHTML = `
      <section class="card">
        <div class="card-head"><h3>🏋️ 오늘 운동</h3><a class="card-link" href="#/workout">기록 ›</a></div>
        <div class="week-dots">${dots}</div>
        ${todays.length ? `<ul class="mini-list">${todays.map((l) => `
          <li><span>${U.esc(exercise(l.exerciseId).name)}</span>
          <span class="muted">${l.sets.length}세트 · 최고 ${setText([...l.sets].sort((a, b) => b.w - a.w || b.r - a.r)[0])}</span></li>`).join('')}
        </ul>` : '<p class="muted small" style="margin:10px 0 0">오늘은 아직 운동 기록이 없어요.</p>'}
      </section>`;
  }

  function stat() {
    const w = weekSummary(U.weekStart(U.today()));
    return {
      icon: '🏋️', label: '이번 주 운동', value: `${w.days}일`,
      sub: `${w.sets}세트 · 볼륨 ${Math.round(w.volume / 100) / 10}t`, href: '#/workout',
    };
  }

  App.register({
    id: 'workout', title: '운동', icon: '🏋️', render, widget,
    api: { hasWorkout, logsOn, weekSummary, stat },
  });
})();
