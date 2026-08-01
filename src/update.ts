/** Обновление приложения: сообщение вместо тихой подмены под ногами.
 *
 * Всё приложение лежит в кэше сервис-воркера, поэтому открытая страница живёт
 * на той сборке, с которой стартовала. Раньше новый воркер звал skipWaiting()
 * прямо в install: он активировался посреди сеанса и сносил кэш старой версии,
 * а страница продолжала крутить старые модули — динамический import после
 * этого мог упереться в сеть, которой нет. Теперь новая версия ждёт, а
 * пользователь узнаёт о ней из баннера и перезагружается, когда ему удобно.
 *
 * Если баннер проигнорировали — ничего не теряется: воркер так и останется
 * ждать и встанет сам, когда приложение закроют и откроют снова.
 */

import { announceUpdate } from "./ui/update-banner.js";

/** Не чаще раза в час: чаще незачем, релизы не выходят каждые пять минут. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Перезагружаемся только после нажатия «Обновить». Смениться воркер может и
 *  сам по себе — например, когда его активировала соседняя вкладка. */
let applying = false;

export function watchForUpdates(): void {
    // file:// сервис-воркеры не поддерживает, регистрация там бросает исключение.
    if (!("serviceWorker" in navigator) || !location.protocol.startsWith("http")) return;

    // Регистрация после load: до неё браузер тратит соединения на саму загрузку.
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").then(watch).catch(() => {
            // Офлайн-режим не включился — на саму тренировку это не влияет.
        });
    });
}

function watch(registration: ServiceWorkerRegistration): void {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (applying) location.reload();
    });

    // Версия могла дождаться нас ещё с прошлого запуска.
    if (registration.waiting && navigator.serviceWorker.controller) offer(registration.waiting);

    registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;

        installing.addEventListener("statechange", () => {
            if (installing.state !== "installed") return;
            // Пустой controller — это первая установка, а не обновление:
            // сообщать не о чем, приложение и так только что загрузилось.
            if (navigator.serviceWorker.controller) offer(installing);
        });
    });

    watchInBackground(registration);
}

/** Проверка обновлений у давно открытой вкладки.
 *
 * Приложение ставится на домашний экран, и его неделями не закрывают, а сам
 * браузер перечитывает sw.js только при навигации. Без этой проверки новая
 * версия дождалась бы разве что случайной перезагрузки. */
function watchInBackground(registration: ServiceWorkerRegistration): void {
    let checked = Date.now();

    const check = (): void => {
        if (document.visibilityState !== "visible") return;
        if (Date.now() - checked < CHECK_INTERVAL_MS) return;
        checked = Date.now();
        registration.update().catch(() => {
            // Сети нет — спросим в следующий раз.
        });
    };

    // Возвращение к приложению — самый частый момент, когда вкладка «просыпается».
    document.addEventListener("visibilitychange", check);
    setInterval(check, CHECK_INTERVAL_MS);
}

function offer(worker: ServiceWorker): void {
    announceUpdate(() => {
        applying = true;
        // Воркер снимет ожидание, активируется и заберёт страницу под контроль —
        // перезагружаемся по controllerchange, иначе получили бы из старого кэша
        // ту же самую старую сборку.
        worker.postMessage({ type: "skip-waiting" });
    });
}
