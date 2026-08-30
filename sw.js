/* =========================================================
   Nishina Unicycle Hub - Service Worker
   ・HTML(index.html)は「まずネットワーク、失敗したらキャッシュ」
   ・その他の静的ファイルは軽くキャッシュしつつ裏で更新
   ・install時にskipWaiting、activate時にclients.claimして
     新しいバージョンをすぐに反映させる
   ========================================================= */

// 変更を確実に配信し直したいときはこのバージョン番号を上げてください
const CACHE_VERSION = 'v1';
const CACHE_NAME = `unicycle-hub-${CACHE_VERSION}`;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './favicon.png',
];

self.addEventListener('install', (event) => {
  // 新しいService Workerを待たせず、すぐに有効化候補にする
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => {
        // 初回キャッシュに失敗してもインストール自体は継続させる
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 古いバージョンのキャッシュを掃除
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
      // すでに開いているタブもすぐにこの新しいSWの管理下に置く
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;

  const isHTMLRequest =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTMLRequest) {
    // HTMLはネットワーク優先。取れなければキャッシュ、それも無ければindex.htmlへ。
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('./index.html'))
        )
    );
    return;
  }

  // その他のリソースはキャッシュを即返しつつ、裏でネットワークから更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});
