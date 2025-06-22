// Definimos un nombre y versión para nuestro caché
const CACHE_NAME = 'mqtt-monitor-v1';

// Lista de ficheros y recursos esenciales para que la app funcione offline
const urlsToCache = [
  '/',
  'index.html',
  'manifest.json',
  'https://unpkg.com/vue@3/dist/vue.global.js',
  'https://cdnjs.cloudflare.com/ajax/libs/paho-mqtt/1.0.1/mqttws31.min.js',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://placehold.co/192x192/4f46e5/ffffff?text=MQTT',
  'https://placehold.co/512x512/4f46e5/ffffff?text=MQTT'
];

// Evento 'install': Se dispara cuando el Service Worker se instala por primera vez.
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  // Esperamos a que la promesa de caches.open() se resuelva
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache abierto, añadiendo URLs principales.');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('Service Worker: Todos los recursos han sido cacheados. ¡Listo para funcionar offline!');
        return self.skipWaiting(); // Forzamos la activación del nuevo SW
      })
      .catch(err => {
        console.error('Service Worker: Falló el cacheo de recursos durante la instalación.', err);
      })
  );
});

// Evento 'activate': Se dispara cuando el Service Worker se activa.
// Se usa para limpiar cachés antiguos.
self.addEventListener('activate', event => {
  console.log('Service Worker: Activado.');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Borrando caché antiguo:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
});


// Evento 'fetch': Se dispara cada vez que la página realiza una petición de red.
self.addEventListener('fetch', event => {
  // Solo interceptamos peticiones GET
  if (event.request.method !== 'GET') {
    return;
  }

  // Estrategia para las peticiones de navegación (cargar la página en sí)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      // 1. Intenta obtener la página de la red primero.
      fetch(event.request)
        .catch(() => {
          // 2. Si la red falla (estás offline), sirve el 'index.html' principal desde el caché.
          // Esto soluciona el error "This site can't be reached".
          return caches.match('index.html');
        })
    );
    return;
  }

  // Estrategia para todos los demás recursos (JS, CSS, fuentes, etc.) - "Cache First"
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Si el recurso ya está en el caché, lo devolvemos inmediatamente.
        if (cachedResponse) {
          return cachedResponse;
        }
        // Si no está en caché, vamos a la red para obtenerlo.
        return fetch(event.request)
          .then(networkResponse => {
            // Y lo guardamos en el caché para futuras peticiones offline.
            return caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, networkResponse.clone());
              // Devolvemos la respuesta de la red para que la página la pueda usar.
              return networkResponse;
            });
          });
      })
  );
});
