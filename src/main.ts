import { startRouter } from "./router.js";
import { showHome } from "./ui/home.js";
import { showDrill } from "./ui/drill.js";
import { showSprint } from "./ui/sprint.js";

/** Уборка за предыдущим экраном: снятие слушателя клавиатуры и таймеров.
 *  Без неё слушатель тренировки продолжил бы ловить нажатия на главной. */
let cleanup: (() => void) | null = null;

function route(path: string): void {
    cleanup?.();
    cleanup = null;

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
}

startRouter(route);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {
            // Офлайн-режим не включился — на саму тренировку это не влияет.
        });
    });
}
