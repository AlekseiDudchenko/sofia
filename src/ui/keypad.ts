/** Экранная цифровая клавиатура.
 *
 * Своя, а не системная: нативная клавиатура на телефоне всплывает с задержкой,
 * съедает пол-экрана и ломает замер времени ответа. Кнопки «готово» нет —
 * ответ проверяется на каждой цифре (см. answer.ts).
 */

export interface KeypadHandlers {
    onDigit(digit: string): void;
    onErase(): void;
}

export function keypadHTML(): string {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const digits = keys.map((k) => `<button class="key" data-key="${k}">${k}</button>`).join("");
    return `
        <div class="keypad" id="keypad">
            ${digits}
            <button class="key util" data-key="erase" aria-label="Стереть">⌫</button>
            <button class="key" data-key="0">0</button>
        </div>
    `;
}

/** Вешает обработчики на клавиатуру и на физические клавиши (для ноутбука).
 *  Возвращает функцию отписки — её обязательно звать при уходе с экрана,
 *  иначе слушатель клавиатуры переживёт страницу и будет ловить чужие нажатия. */
export function bindKeypad(scope: HTMLElement, handlers: KeypadHandlers): () => void {
    const onClick = (event: Event) => {
        const button = (event.target as HTMLElement).closest<HTMLElement>("[data-key]");
        if (!button) return;
        const key = button.dataset.key!;
        if (key === "erase") handlers.onErase();
        else handlers.onDigit(key);
    };

    const onKeydown = (event: KeyboardEvent) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return;
        if (/^[0-9]$/.test(event.key)) {
            event.preventDefault();
            handlers.onDigit(event.key);
        } else if (event.key === "Backspace") {
            event.preventDefault();
            handlers.onErase();
        }
    };

    scope.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);

    return () => {
        scope.removeEventListener("click", onClick);
        document.removeEventListener("keydown", onKeydown);
    };
}
