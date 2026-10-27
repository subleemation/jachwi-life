// 앱 본체: 모듈 등록, 화면 전환(라우팅), 공통 설정, 토스트·모달 같은 공용 UI
//
// 모듈은 이렇게 생긴 객체 하나다:
//   App.register({
//     id: 'moving',            // 주소(#/moving)와 저장 키에 쓰는 이름
//     title: '이사 준비',       // 메뉴·상단 제목
//     icon: '📦',
//     render(el) { ... },      // 이 모듈 화면을 el 안에 그린다
//     widget(el) { ... },      // (선택) 홈 화면 아래쪽에 보여줄 자세한 카드
//     nav: true,               // (선택) false면 메뉴에 안 보임
//     api: { ... },            // (선택) 다른 모듈이 App.use('id')로 불러 쓸 함수들
//   });
//
// 모듈끼리는 서로의 저장 데이터를 직접 읽지 말고 api를 통해서만 주고받는다.
// 예) 식단 모듈이 "이 날 운동했나?"를 알고 싶을 때: App.use('workout')?.hasWorkout('2027-03-02')

const App = (() => {
  const modules = [];
  // 입주일·닉네임은 코드에 적지 않고, 처음 열 때 물어봐서 이 브라우저에만 저장한다
  const DEFAULT_SETTINGS = { moveInDate: '', nickname: '' };

  const $ = (sel) => document.querySelector(sel);

  function register(mod) {
    modules.push(mod);
  }

  // 다른 모듈의 api 꺼내기 (그 모듈이 없으면 null → ?. 로 안전하게 호출)
  function use(id) {
    return modules.find((m) => m.id === id)?.api || null;
  }

  // ---------- 공통 설정 ----------
  function settings() {
    return { ...DEFAULT_SETTINGS, ...Store.get('settings', {}) };
  }

  function saveSettings(patch) {
    Store.set('settings', { ...settings(), ...patch });
  }

  function moveInDate() {
    return U.parseDate(settings().moveInDate);
  }

  // ---------- 화면 전환 ----------
  function currentId() {
    const id = location.hash.replace(/^#\/?/, '');
    return modules.some((m) => m.id === id) ? id : 'home';
  }

  function renderNav() {
    $('#nav').innerHTML =
      '<div class="nav-brand">자취 라이프</div>' +
      modules
        .filter((m) => m.nav !== false)
        .map((m) => `
          <a href="#/${m.id}" class="nav-item" data-id="${m.id}">
            <span class="nav-icon" aria-hidden="true">${m.icon}</span>
            <span class="nav-label">${U.esc(m.title)}</span>
          </a>`)
        .join('');
  }

  // 현재 주소에 맞는 모듈을 다시 그린다. 데이터가 바뀐 뒤 전체를 새로 그리고 싶을 때도 호출.
  function render() {
    if (!settings().moveInDate) { renderSetup(); return; }
    const mod = modules.find((m) => m.id === currentId());
    const main = $('#main');
    $('#page-title').textContent = mod.id === 'home' ? '자취 라이프' : mod.title;
    document.title = mod.id === 'home' ? '자취 라이프' : `${mod.title} · 자취 라이프`;
    document.querySelectorAll('.nav-item').forEach((a) => {
      a.classList.toggle('active', a.dataset.id === mod.id);
    });
    main.innerHTML = '';
    mod.render(main);
  }

  // 처음 시작 화면: 입주일(필수)과 닉네임(선택)을 받는다. 모든 모듈이 입주일을 기준으로 계산하므로 먼저 받아둔다.
  function renderSetup() {
    $('#page-title').textContent = '자취 라이프';
    document.querySelectorAll('.nav-item').forEach((a) => a.classList.remove('active'));
    $('#main').innerHTML = `
      <section class="card hero" style="margin-top:8px">
        <div class="dday" style="font-size:28px">처음 오셨네요 👋</div>
        <div class="sub">입주일만 알려주면 바로 시작할 수 있어요.</div>
      </section>
      <form class="card" data-setup>
        <label class="field"><span>입주일</span><input type="date" name="moveIn" required></label>
        <label class="field"><span>닉네임 (선택, 홈 인사에 쓰여요)</span>
          <input name="nickname" maxlength="10" autocomplete="off" placeholder="예: 민지">
        </label>
        <p class="hint" style="margin-top:0">이 정보는 이 기기의 브라우저에만 저장돼요. 설정에서 언제든 바꿀 수 있어요.</p>
        <button type="submit" class="btn primary block">시작하기</button>
      </form>`;
    const form = $('[data-setup]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.elements.moveIn.value) { form.elements.moveIn.focus(); return; }
      saveSettings({ moveInDate: form.elements.moveIn.value, nickname: form.elements.nickname.value.trim() });
      render();
    });
  }

  function go(id) {
    location.hash = `#/${id}`;
  }

  // ---------- 이모지 회색 처리 ----------
  // 이모지 색은 폰 글꼴이 정해서 CSS 색으로는 못 바꾼다.
  // 그래서 화면에 들어오는 글자 속 이모지를 <span class="emo">로 감싸고, CSS에서 회색 필터를 건다.
  const EMOJI_SPLIT = /(\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*)/gu;
  const HAS_EMOJI = /\p{Extended_Pictographic}/u;
  const NO_WRAP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'TITLE']);   // span을 넣을 수 없는 곳

  function grayEmoji(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || NO_WRAP.has(p.tagName) || p.closest('.emo, svg')) return NodeFilter.FILTER_REJECT;
        return HAS_EMOJI.test(node.data) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    const found = [];
    while (walker.nextNode()) found.push(walker.currentNode);
    found.forEach((node) => {
      const frag = document.createDocumentFragment();
      node.data.split(EMOJI_SPLIT).forEach((part, i) => {
        if (!part) return;
        if (i % 2) {
          const span = document.createElement('span');
          span.className = 'emo';
          span.textContent = part;
          frag.append(span);
        } else {
          frag.append(part);
        }
      });
      node.replaceWith(frag);
    });
  }

  function watchEmoji() {
    grayEmoji(document.body);
    new MutationObserver((mutations) => {
      mutations.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType === Node.ELEMENT_NODE) grayEmoji(n);
        else if (n.nodeType === Node.TEXT_NODE && n.parentElement) grayEmoji(n.parentElement);
      }));
    }).observe(document.body, { childList: true, subtree: true });
  }

  function start() {
    watchEmoji();
    renderNav();
    window.addEventListener('hashchange', () => {
      render();
      window.scrollTo(0, 0);
    });
    render();

    // PWA: http(s)로 열었을 때만 서비스 워커 등록 (파일을 더블클릭해서 열면 건너뜀)
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('서비스 워커 등록 실패', e));
    }
  }

  // ---------- 토스트 (화면 아래 잠깐 뜨는 알림) ----------
  let toastTimer;
  function toast(message, action) {
    const el = $('#toast');
    el.innerHTML = `<span>${U.esc(message)}</span>` +
      (action ? `<button type="button" class="toast-btn">${U.esc(action.label)}</button>` : '');
    if (action) {
      el.querySelector('.toast-btn').onclick = () => {
        el.classList.remove('show');
        action.onClick();
      };
    }
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), action ? 5000 : 2500);
  }

  // ---------- 모달 ----------
  // bodyHtml 안에 <form> 내용(입력칸, 버튼)을 넣으면 dialog 요소를 돌려준다.
  // data-close 속성이 있는 버튼은 누르면 닫힌다.
  function modal(title, bodyHtml) {
    const dlg = document.createElement('dialog');
    dlg.className = 'modal';
    dlg.innerHTML = `
      <form class="modal-inner" novalidate>
        <div class="modal-head">
          <h2>${U.esc(title)}</h2>
          <button type="button" class="icon-btn" data-close aria-label="닫기">✕</button>
        </div>
        ${bodyHtml}
      </form>`;
    document.body.appendChild(dlg);
    // 닫으면 바로 화면에서 없앤다 ('close' 이벤트가 늦거나 안 오는 브라우저가 있어 직접 처리)
    const nativeClose = dlg.close.bind(dlg);
    dlg.close = () => { nativeClose(); dlg.remove(); };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); dlg.close(); });   // Esc 키
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) dlg.close();
    });
    dlg.showModal();
    return dlg;
  }

  return { register, use, modules, settings, saveSettings, moveInDate, render, go, start, toast, modal };
})();
