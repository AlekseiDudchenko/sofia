/* Service worker: приложение целиком уходит в офлайн после первой загрузки.
 * VERSION подставляется скриптом scripts/stamp-version.mjs из package.json —
 * смена версии катит новый кэш и выбрасывает старый. */
const VERSION = "0.2.0";
const CACHE = `umnozhenie-${VERSION}`;

/* Минимум, чтобы приложение поднялось без сети. Скомпилированные модули
 * подтягиваются тем же обработчиком при первой загрузке — они грузятся сразу,
 * так что к моменту первого офлайна уже лежат в кэше. */
const SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./manifest.webmanifest",
    "./js/main.js",
    "./icons/icon.svg",
];

self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(SHELL))
            .then(() => self.skipWaiting()),
    );
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim()),
    );
});

async function staleWhileRevalidate(request) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => undefined);
    // Из кэша отдаём сразу, обновление подхватится к следующему запуску.
    return cached ?? (await network) ?? Response.error();
}

async function handleNavigation(request) {
    try {
        return await fetch(request);
    } catch {
        return (await caches.match("./index.html")) ?? Response.error();
    }
}

self.addEventListener("fetch", (event) => {
    const request = event.request;
    if (request.method !== "GET") return;

    if (request.mode === "navigate") {
        event.respondWith(handleNavigation(request));
        return;
    }

    // Стороннего ничего нет — ни аналитики, ни шрифтов, ни API.
    if (new URL(request.url).origin !== self.location.origin) return;

    event.respondWith(staleWhileRevalidate(request));
});
