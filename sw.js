const CACHE_NAME = 'expense-tracker-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/style.css',
  '/app.js',
  '/js/auth.js',
  '/js/db.js',
  '/js/toast.js',
  '/js/firebase-config.js',
  'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Inter:wght@400;500;600&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
