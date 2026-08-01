/** Посимвольная проверка ответа.
 *
 * Все произведения в таблице 2–9 лежат в диапазоне 4…81, то есть одна или
 * две цифры. Кнопка «готово» не нужна: для конкретного примера ответ
 * единственный, поэтому после каждой цифры состояние определяется однозначно.
 * Это экономит ребёнку по тапу на каждом примере — на сотне примеров в день
 * разница заметная.
 */

export type InputVerdict = "pending" | "correct" | "wrong";

export function checkInput(typed: string, product: number): InputVerdict {
    if (typed === "") return "pending";
    const answer = String(product);
    if (typed === answer) return "correct";
    // Набрано «6» при ответе «63» — ещё не ошибка, ждём вторую цифру.
    if (answer.startsWith(typed)) return "pending";
    return "wrong";
}
