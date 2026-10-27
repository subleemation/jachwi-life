// 저장 계층
// 모듈들은 localStorage를 직접 만지지 않고 항상 Store.get / Store.set 만 쓴다.
// 나중에 기기 간 동기화(서버, Firebase 등)가 필요해지면
// 아래 LocalBackend와 같은 모양(read/write/remove/keys)의 객체를 만들어 바꿔 끼우면 된다.

const LocalBackend = {
  read(key) {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : JSON.parse(raw);
  },
  write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
  remove(key) {
    localStorage.removeItem(key);
  },
  keys() {
    return Object.keys(localStorage);
  },
};

const Store = ((backend) => {
  const PREFIX = 'shlife:';        // 이 앱의 데이터만 구분하기 위한 접두어
  const APP_ID = 'jachwi-life';
  const OLD_APP_IDS = ['seunghwa-life'];   // 예전 이름으로 만든 백업도 가져올 수 있게
  const FORMAT_VERSION = 1;

  const ownKeys = () => backend.keys().filter((k) => k.startsWith(PREFIX));

  return {
    get(key, fallback) {
      try {
        const value = backend.read(PREFIX + key);
        return value === undefined ? fallback : value;
      } catch (e) {
        console.warn('불러오기 실패:', key, e);
        return fallback;
      }
    },

    set(key, value) {
      try {
        backend.write(PREFIX + key, value);
      } catch (e) {
        console.error('저장 실패:', key, e);
        alert('저장에 실패했어요. 브라우저 저장 공간이나 시크릿 모드인지 확인해 주세요.');
      }
    },

    remove(key) {
      backend.remove(PREFIX + key);
    },

    // 백업용: 이 앱의 모든 데이터를 하나의 객체로
    exportAll() {
      const data = {};
      ownKeys().forEach((k) => { data[k.slice(PREFIX.length)] = backend.read(k); });
      return { app: APP_ID, version: FORMAT_VERSION, exportedAt: new Date().toISOString(), data };
    },

    // 복원: 기존 데이터를 지우고 백업 내용으로 덮어쓴다
    importAll(backup) {
      const knownApp = backup && (backup.app === APP_ID || OLD_APP_IDS.includes(backup.app));
      if (!knownApp || typeof backup.data !== 'object') {
        throw new Error('자취 라이프 백업 파일이 아니에요.');
      }
      ownKeys().forEach((k) => backend.remove(k));
      Object.entries(backup.data).forEach(([k, v]) => backend.write(PREFIX + k, v));
    },

    clearAll() {
      ownKeys().forEach((k) => backend.remove(k));
    },

    // 대략적인 사용량 (바이트)
    usedBytes() {
      return ownKeys().reduce((acc, k) => acc + k.length + (localStorage.getItem(k) || '').length, 0) * 2;
    },
  };
})(LocalBackend);
