/** Минимум помощников для работы с DOM — фреймворка здесь нет и не нужно. */

export function root(): HTMLElement {
    return document.getElementById("app")!;
}

export function render(markup: string): HTMLElement {
    const el = root();
    el.innerHTML = markup;
    el.scrollTop = 0;
    return el;
}

export function qs<T extends HTMLElement>(selector: string, scope: ParentNode = document): T {
    const el = scope.querySelector<T>(selector);
    if (!el) throw new Error(`не найден элемент: ${selector}`);
    return el;
}

/** Делегирование по data-act — так разметку можно перерисовывать свободно. */
export function onAction(scope: HTMLElement, handler: (action: string, el: HTMLElement) => void): void {
    scope.addEventListener("click", (event) => {
        const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
        if (!target || !scope.contains(target)) return;
        handler(target.dataset.act!, target);
    });
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
