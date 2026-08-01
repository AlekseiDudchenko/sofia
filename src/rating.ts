/** Оценка ответа по правильности и скорости.
 *
 * Здесь главное отличие тренажёра таблицы умножения от обычных карточек:
 * ребёнок не оценивает себя сам. Правильный ответ через восемь секунд — это
 * не знание, а пересчёт «7+7+7…», и засчитывать его как успех значит
 * законсервировать привычку считать вместо того, чтобы помнить.
 *
 * Замеряется время до ПЕРВОЙ нажатой цифры, а не до конца ввода: набор
 * второй цифры добавляет полсекунды моторики, которая к припоминанию
 * отношения не имеет.
 */

export type Speed = "fast" | "ok" | "slow";

/** Быстрее — уже автоматизм, а не счёт. */
export const FAST_MS = 2000;
/** Медленнее — почти наверняка досчитывала. */
export const OK_MS = 6000;
/** Ещё медленнее — скорее отвлеклась, таймингу верить нельзя. */
export const DISTRACTED_MS = 15000;

export interface Grade {
    correct: boolean;
    speed: Speed;
    /** false — пауза была слишком долгой, время не отражает припоминание. */
    timingTrusted: boolean;
}

export function grade(correct: boolean, latencyMs: number): Grade {
    if (latencyMs >= DISTRACTED_MS) {
        return { correct, speed: "ok", timingTrusted: false };
    }
    const speed: Speed = latencyMs < FAST_MS ? "fast" : latencyMs < OK_MS ? "ok" : "slow";
    return { correct, speed, timingTrusted: true };
}
