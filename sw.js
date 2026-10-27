// 서비스 워커: 한 번 열었던 파일을 저장해 두어 인터넷이 없어도 앱이 열리게 한다.
// 인터넷이 되면 항상 최신 파일을 먼저 받아오므로(network-first) 수정 사항이 바로 반영된다.
// 새 파일(모듈)을 추가하면 아래 ASSETS 목록에도 한 줄 추가하기.

const CACHE = 'shlife-v12';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/utils.js',
  'js/storage.js',
  'js/app.js',
  'modules/home.js',
  'modules/moving.js',
  'modules/budget.js',
  'modules/meal.js',
  'modules/workout.js',
  'modules/settings.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    // no-cache: 브라우저에 남은 옛 파일을 쓰지 말고 서버에 바뀌었는지 꼭 확인
    fetch(req, { cache: 'no-cache' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }))
  );
});
