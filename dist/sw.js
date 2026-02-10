const CACHE_NAME = 'mtg-deck-analyzer-v2'; // Increment this for each update!
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install service worker and cache assets
self.addEventListener('install', event => {
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache:', CACHE_NAME);
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate and clean up old caches immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

// Network-first strategy for better updates
self.addEventListener('fetch', event => {
  // Handle share target POST requests
  if (event.request.url.endsWith('/import') && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  event.respondWith(
    // Try network first
    fetch(event.request)
      .then(response => {
        // Clone the response
        const responseToCache = response.clone();
        
        // Update cache with new response
        caches.open(CACHE_NAME)
          .then(cache => {
            cache.put(event.request, responseToCache);
          });
        
        return response;
      })
      .catch(() => {
        // If network fails, try cache
        return caches.match(event.request);
      })
  );
});

// Handle shared files from other apps (like Manabox)
async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('deck_file');
    const title = formData.get('title');
    const text = formData.get('text');

    console.log('Share target received:', { file, title, text });

    // Store the shared data temporarily
    if (file) {
      const fileText = await file.text();
      
      // Store in cache for the app to retrieve
      await caches.open(CACHE_NAME).then(cache => {
        const response = new Response(fileText, {
          headers: { 'Content-Type': 'text/plain' }
        });
        cache.put('/shared-deck-data', response);
      });

      // Notify all clients about the shared file
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach(client => {
        client.postMessage({
          type: 'SHARED_FILE',
          filename: file.name,
          size: fileText.length
        });
      });
    }

    // Redirect to the app's main page
    return Response.redirect('/', 303);
  } catch (error) {
    console.error('Share target error:', error);
    return Response.redirect('/', 303);
  }
}
