import { startRouter } from "./router.js";
import { primeSound } from "./sound.js";
import { showHome } from "./ui/home.js";
import { showDrill } from "./ui/drill.js";
import { showSprint } from "./ui/sprint.js";
import { showMarathon } from "./ui/marathon.js";

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
    } else if (path === "/marathon") {
        document.title = "Марафон";
        cleanup = showMarathon();
    } else {
        document.title = "Таблица умножения миньонов для Сони из Томска";
        cleanup = showHome();
    }
}

primeSound();
startRouter(route);

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch(() => {
            // Офлайн-режим не включился — на саму тренировку это не влияет.
        });
    });
}
