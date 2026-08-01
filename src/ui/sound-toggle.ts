/** Переключатель звука — один на все экраны.
 *
 * Стоит в двух местах, и оба нужны. В панели тренировки — потому что глушить
 * звук хочется ровно тогда, когда он мешает: посреди занятия, не выходя из
 * него. В настройках на главной — потому что искать выключенный звук идут
 * туда же, куда за копией прогресса, а на экране тренировки иконка ничего не
 * подскажет, пока звук уже не выключен.
 *
 * В шапке главной кнопке места нет: заголовок и стрик занимают строку целиком
 * и на телефоне в 320 CSS-пикселей заголовок от неё переносится на две строки.
 */

import { soundEnabled, setSoundEnabled } from "../store.js";
import { play } from "../sound.js";

export const SOUND_ACTION = "sound";

function icon(on: boolean): string {
    return on ? "🔊" : "🔇";
}

function label(on: boolean): string {
    return on ? "Выключить звук" : "Включить звук";
}

/** Эмодзи вынесено в отдельный span: у кнопки в настройках рядом есть подпись,
 *  и переписывать textContent кнопки целиком означало бы стереть её. */
function markup(attrs: string, caption: string): string {
    const on = soundEnabled();
    return `<button ${attrs} data-act="${SOUND_ACTION}" aria-pressed="${on}" aria-label="${label(on)}">`
        + `<span class="sound-ic">${icon(on)}</span>${caption}</button>`;
}

/** Кнопка-иконка для панели тренировки и спринта. */
export function soundIconHTML(): string {
    return markup(`class="icon-btn quiet"`, "");
}

/** Кнопка с подписью для блока настроек на главной. */
export function soundToolHTML(): string {
    return markup("", " Звук");
}

/** Переключает звук и перерисовывает саму кнопку.
 *
 * Именно кнопку, а не экран: на тренировке перерисовка выбросила бы текущий
 * пример и обнулила замер времени ответа. */
export function toggleSound(el: HTMLElement): void {
    const on = !soundEnabled();
    setSoundEnabled(on);

    const glyph = el.querySelector(".sound-ic");
    if (glyph) glyph.textContent = icon(on);
    el.setAttribute("aria-pressed", String(on));
    el.setAttribute("aria-label", label(on));

    // Включение подтверждается самим звуком: иначе непонятно, что изменилось.
    if (on) play("correct");
}
