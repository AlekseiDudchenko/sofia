/** Сообщение «вышла новая версия» с кнопкой перезагрузки.
 *
 * Живёт вне #app: render() переписывает контейнер целиком на каждом экране, и
 * баннер внутри него исчезал бы при первом же переходе — а сообщение обязано
 * пережить и тренировку, и возврат на главную.
 *
 * Показывается только на главной. Полоса внизу экрана тренировки накрыла бы
 * нижний ряд клавиатуры, то есть отобрала бы у ребёнка кнопки ответа, а
 * перезагрузка посреди спринта стёрла бы набранные за минуту очки. Обновление
 * никуда не убежит: сеанс кончится, экран вернётся на главную — там и спросим.
 */

const CLASS = "update-bar";

/** Перезагрузка по кнопке. null — обновления нет, показывать нечего. */
let apply: (() => void) | null = null;
let onHome = false;

/** Сообщает, что новая версия готова и ждёт перезагрузки. */
export function announceUpdate(onApply: () => void): void {
    apply = onApply;
    sync();
}

/** Смена экрана: на главной баннер видно, на тренировке и в спринте — нет. */
export function syncUpdateBanner(home: boolean): void {
    onHome = home;
    sync();
}

function sync(): void {
    const shown = document.querySelector(`.${CLASS}`);
    const wanted = apply !== null && onHome;

    if (!wanted) {
        shown?.remove();
        document.body.classList.remove("update-open");
        return;
    }
    if (shown) return;

    document.body.append(build());
    // Пока баннер висит, он перекрывает низ главной — освобождаем место, чтобы
    // кнопки настроек не оказались под ним.
    document.body.classList.add("update-open");
}

function build(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = CLASS;
    // role=status: программа чтения с экрана произнесёт сообщение сама, но не
    // перебивая — обновление не срочнее того, что ребёнок делает сейчас.
    bar.setAttribute("role", "status");

    const text = document.createElement("span");
    text.textContent = "Вышла новая версия";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Обновить";
    button.addEventListener("click", () => {
        // Ответа ждать секунду-другую: воркер должен смениться, и только потом
        // страница перезагрузится. Без отметки кажется, что кнопка не нажалась.
        button.disabled = true;
        button.textContent = "Обновляем…";
        apply?.();
    });

    bar.append(text, button);
    return bar;
}
