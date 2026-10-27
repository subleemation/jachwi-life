// 설정: 입주일 변경, 데이터 백업(내보내기)/복원(가져오기), 초기화

(() => {
  function render(el) {
    const s = App.settings();
    const kb = (Store.usedBytes() / 1024).toFixed(1);

    el.innerHTML = `
      <section class="card">
        <div class="card-head"><h2>🏠 기본 정보</h2></div>
        <label class="field"><span>입주일</span>
          <input type="date" class="input" data-movein value="${s.moveInDate}">
          <span class="hint">바꾸면 이사 준비 항목들의 기한이 함께 옮겨져요.</span>
        </label>
        <label class="field" style="margin-bottom:0"><span>닉네임 (선택)</span>
          <input class="input" data-nickname maxlength="10" autocomplete="off" value="${U.esc(s.nickname)}">
        </label>
      </section>

      <section class="card">
        <div class="card-head"><h2>💾 백업</h2></div>
        <p class="muted small" style="margin-top:0">
          데이터는 이 기기의 브라우저 안에만 저장돼요. 폰을 바꾸거나 브라우저 기록을 지우기 전에
          백업 파일을 내보내 두고, 다른 기기에서 가져오기로 옮길 수 있어요.
        </p>
        <div class="row">
          <button type="button" class="btn" data-export>⬇️ 내보내기</button>
          <button type="button" class="btn" data-import>⬆️ 가져오기</button>
        </div>
        <input type="file" accept="application/json,.json" data-file hidden>
        <p class="hint">현재 사용량 약 ${kb} KB</p>
      </section>

      <section class="card">
        <div class="card-head"><h2>⚠️ 초기화</h2></div>
        <p class="muted small" style="margin-top:0">모든 데이터를 지우고 처음 상태(기본 체크리스트)로 돌아가요.</p>
        <button type="button" class="btn danger block" data-reset>전체 데이터 초기화</button>
      </section>

      <p class="muted small" style="text-align:center">자취 라이프 · 통합 홈 · 이사 준비 · 가계부 · 식단 · 운동</p>`;

    el.querySelector('[data-movein]').addEventListener('change', (e) => {
      if (!e.target.value) return;
      App.saveSettings({ moveInDate: e.target.value });
      App.toast(`입주일을 ${U.prettyDate(U.parseDate(e.target.value))}로 바꿨어요`);
    });

    el.querySelector('[data-nickname]').addEventListener('change', (e) => {
      App.saveSettings({ nickname: e.target.value.trim() });
      App.toast('닉네임을 저장했어요');
    });

    el.querySelector('[data-export]').addEventListener('click', () => {
      const json = JSON.stringify(Store.exportAll(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `jachwi-life-backup-${U.fmtDate(U.today())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      App.toast('백업 파일을 저장했어요');
    });

    const fileInput = el.querySelector('[data-file]');
    el.querySelector('[data-import]').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      fileInput.value = '';
      if (!file) return;
      try {
        const backup = JSON.parse(await file.text());
        const when = backup.exportedAt ? new Date(backup.exportedAt).toLocaleString('ko-KR') : '알 수 없음';
        if (!confirm(`백업(${when})으로 지금 데이터를 덮어쓸까요?`)) return;
        Store.importAll(backup);
        App.render();
        App.toast('백업을 불러왔어요');
      } catch (e) {
        alert(`가져오기 실패: ${e.message}`);
      }
    });

    el.querySelector('[data-reset]').addEventListener('click', () => {
      if (!confirm('정말 모든 데이터를 지울까요? 되돌릴 수 없어요. (먼저 내보내기를 권장해요)')) return;
      Store.clearAll();
      App.render();
      App.toast('초기화했어요');
    });
  }

  App.register({ id: 'settings', title: '설정', icon: '⚙️', render });
})();
