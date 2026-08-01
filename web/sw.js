/* Service worker: приложение целиком уходит в офлайн после первой загрузки.
 * VERSION подставляется скриптом scripts/stamp-version.mjs из package.json —
 * смена версии катит новый кэш и выбрасывает старый. */
const VERSION = "0.3.0";
const CACHE = `umnozhenie-${VERSION}`;

/* Скомпилированные модули. Список подставляет scripts/stamp-version.mjs после
 * tsc — руками его не правят.
 *
 * Нужен он целиком, а не одним main.js: смена версии заводит новый кэш, а
 * activate сносит старый. Всё, чего нет в SHELL, из кэша при этом пропадает и
 * подтягивается из сети только при следующем запуске. Уйти в офлайн в этом
 * промежутке означало бы белый экран — import упёрся бы в Response.error(). */
const MODULES = [
    "./js/answer.js",
    "./js/facts.js",
    "./js/main.js",
    "./js/rating.js",
    "./js/router.js",
    "./js/scheduler.js",
    "./js/session.js",
    "./js/sound.js",
    "./js/store.js",
    "./js/ui/dom.js",
    "./js/ui/drill.js",
    "./js/ui/home.js",
    "./js/ui/keypad.js",
    "./js/ui/minion.js",
    "./js/ui/sound-toggle.js",
    "./js/ui/sprint.js",
];

/* Всё, что нужно, чтобы приложение поднялось без сети. */
const SHELL = [
    "./",
    "./index.html",
    "./style.css",
    "./manifest.webmanifest",
    "./icons/icon.svg",
    ...MODULES,
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
