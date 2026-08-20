/* ============================================================
   Service Worker — Quỹ Anh Em (PWA)
   Muc tieu: mo nhanh + chay duoc khi mat mang (chi phan vo giao dien).
   AN TOAN: KHONG bao gio cache du lieu Supabase (giao dich, con no...)
   -> du lieu luon lay tuoi tu mang. SW chi cache file tinh cua app.
   ============================================================ */

// Doi so phien ban moi khi sua file tinh (buoc SW cap nhat cache).
const VERSION = 'v1';
const CACHE = 'quy-ae-' + VERSION;

// "Vo" app can cache de mo duoc khi offline.
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/config.js',
  '/qr.jpg',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

// Cai dat: precache vo app.
self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll that bai 1 file la fail het -> dung allSettled cho chac.
      return Promise.allSettled(SHELL.map(function (u) { return c.add(u); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

// Kich hoat: xoa cache phien ban cu.
self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;                       // chi xu ly GET

  var url = new URL(req.url);

  // Cross-origin (Supabase API/Storage, CDN supabase-js, Google Fonts):
  // KHONG can thiep -> de trinh duyet lay truc tiep tu mang (du lieu tuoi).
  if (url.origin !== self.location.origin) return;

  // Dieu huong trang (HTML): network-first, mat mang thi lay index tu cache.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(function () {
        return caches.match('/index.html').then(function (r) {
          return r || caches.match('/');
        });
      })
    );
    return;
  }

  // File tinh same-origin: stale-while-revalidate
  // -> tra cache ngay cho nhanh, dong thoi cap nhat ngam tu mang.
  e.respondWith(
    caches.match(req).then(function (cached) {
      var fromNet = fetch(req).then(function (res) {
        if (res && res.status === 200 && res.type === 'basic') {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return cached; });
      return cached || fromNet;
    })
  );
});
