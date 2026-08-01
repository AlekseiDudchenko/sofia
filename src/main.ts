import { startRouter } from "./router.js";
import { primeSound } from "./sound.js";
import { watchForUpdates } from "./update.js";
import { showHome } from "./ui/home.js";
import { showDrill } from "./ui/drill.js";
import { showSprint } from "./ui/sprint.js";
import { syncUpdateBanner } from "./ui/update-banner.js";

/** Уборка за предыдущим экраном: снятие слушателя клавиатуры и таймеров.
 *  Без неё слушатель тренировки продолжил бы ловить нажатия на главной. */
let cleanup: (() => void) | null = null;

function route(path: string): void {
    cleanup?.();
    cleanup = null;

    const play = path === "/drill" || path === "/sprint";

    if (path === "/drill") {
        document.title = "Тренировка";
        cleanup = showDrill();
    } else if (path === "/sprint") {
        document.title = "Спринт";
        cleanup = showSprint();
    } else {
        document.title = "Таблица умножения";
        cleanup = showHome();
    }

    // Баннер обновления живёт вне #app, поэтому переживает смену экрана сам —
    // но о том, что экран сменился, знает только маршрутизация.
    syncUpdateBanner(!play);
}

primeSound();
startRouter(route);
watchForUpdates();
