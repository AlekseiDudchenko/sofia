/** Минимум помощников для работы с DOM — фреймворка здесь нет и не нужно. */

export function root(): HTMLElement {
    return document.getElementById("app")!;
}

interface Delegate {
    scope: HTMLElement;
    listener: (event: MouseEvent) => void;
}

/** Делегаты, поставленные экраном, который сейчас на виду. */
let delegates: Delegate[] = [];

export function render(markup: string): HTMLElement {
    const el = root();

    // Разметка уходит — обработчики предыдущего экрана обязаны уйти с ней.
    // Контейнер #app один на всё приложение, и без этой уборки делегаты
    // копятся: одно и то же имя действия на двух экранах (например «sound»
    // в панели тренировки и в настройках) отрабатывало бы дважды за клик.
    for (const { scope, listener } of delegates) scope.removeEventListener("click", listener);
    delegates = [];

    el.innerHTML = markup;
    el.scrollTop = 0;
    return el;
}

export function qs<T extends HTMLElement>(selector: string, scope: ParentNode = document): T {
    const el = scope.querySelector<T>(selector);
    if (!el) throw new Error(`не найден элемент: ${selector}`);
    return el;
}

/** Делегирование по data-act — так разметку можно перерисовывать свободно.
 *  Слушатель снимается сам при следующем render(). */
export function onAction(scope: HTMLElement, handler: (action: string, el: HTMLElement) => void): void {
    const listener = (event: MouseEvent) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
        if (!target || !scope.contains(target)) return;
        handler(target.dataset.act!, target);
    };

    scope.addEventListener("click", listener);
    delegates.push({ scope, listener });
}

export function escapeHtml(value: string): string {
    return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

/** Склонение существительного после числа: 1 день, 2 дня, 5 дней. */
export function plural(n: number, one: string, few: string, many: string): string {
    const mod100 = n % 100;
    if (mod100 >= 11 && mod100 <= 14) return many;
    const mod10 = n % 10;
    if (mod10 === 1) return one;
    if (mod10 >= 2 && mod10 <= 4) return few;
    return many;
}

export function formatSeconds(ms: number): string {
    return (ms / 1000).toFixed(1).replace(".", ",");
}
