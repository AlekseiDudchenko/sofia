/** Интервальное повторение со скоростным гейтом.
 *
 * Ступенчатая лестница вместо FSRS. Причина: FSRS выигрывает на колодах в
 * тысячи карточек и горизонте в годы, где важно выжать точный интервал.
 * Здесь 36 фактов и горизонт в несколько недель — выигрыша не будет, а
 * два десятка непрозрачных коэффициентов появятся.
 *
 * Ключевое правило: ступень растёт ТОЛЬКО от быстрого ответа. Поэтому
 * «выучено» (box >= MASTERED_BOX) по построению означает пять быстрых
 * ответов в разные дни, то есть автоматизм, а не удачное припоминание.
 */

export const MAX_BOX = 6;
/** С этой ступени факт считается доведённым до автоматизма. */
export const MASTERED_BOX = 5;

/** Интервал до следующего показа, в днях, по ступеням 0…6. */
const INTERVALS = [1, 1, 2, 4, 8, 16, 32];

/** Сколько новых фактов вводить за день. 36 фактов / 6 = неделя на всю таблицу. */
export const NEW_PER_DAY = 6;

export interface CardState {
    id: string;
    box: number;
    /** ISO-дата (YYYY-MM-DD) следующего показа. */
    due: string;
    /** День, когда факт впервые попал в тренировку — ограничивает ввод новых. */
    firstSeen: string;
    /** ISO-дата последнего ответа, двигавшего ступень. */
    lastGraded: string | null;
    reps: number;
    wrong: number;
    /** Лучшее время ответа, мс — для «личного рекорда» по факту. */
    bestMs: number | null;
}

export function newCard(id: string, today: string): CardState {
    return { id, box: 0, due: today, firstSeen: today, lastGraded: null, reps: 0, wrong: 0, bestMs: null };
}

export function dayKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export function addDays(day: string, days: number): string {
    const [y, m, d] = day.split("-").map(Number);
    const date = new Date(y!, m! - 1, d!);
    date.setDate(date.getDate() + days);
    return dayKey(date);
}

export function intervalFor(box: number): number {
    return INTERVALS[Math.max(0, Math.min(MAX_BOX, box))]!;
}

export function isMastered(card: CardState | undefined): boolean {
    return !!card && card.box >= MASTERED_BOX;
}

/** Двигает ли этот ответ расписание, или он «просто практика».
 *
 * Ступень меняется не чаще раза в календарный день. Без этого правила
 * переспрошенный в той же сессии факт (ошиблась → через четыре примера
 * ответила верно) прыгнул бы вверх по лестнице и объявился выученным,
 * хотя пять минут назад его не знали. Повторные ответы за день по-прежнему
 * идут в статистику и в дневную норму — они просто не трогают интервалы.
 */
export function advancesSchedule(card: CardState, today: string): boolean {
    return card.lastGraded !== today;
}

export interface Outcome {
    correct: boolean;
    speed: "fast" | "ok" | "slow";
    timingTrusted: boolean;
    latencyMs: number;
}

/** Новое состояние карточки после ответа. Чистая функция — вход не мутируется. */
export function applyOutcome(card: CardState, outcome: Outcome, today: string): CardState {
    const next: CardState = { ...card };

    next.reps++;
    if (!outcome.correct) next.wrong++;
    if (outcome.correct && (next.bestMs === null || outcome.latencyMs < next.bestMs)) {
        next.bestMs = outcome.latencyMs;
    }

    if (!advancesSchedule(card, today)) return next;

    if (!outcome.correct) {
        // Ошибка сбрасывает факт в начало: он снова пойдёт каждый день.
        next.box = 0;
    } else if (!outcome.timingTrusted) {
        // Верно, но с большой паузой — не наказываем и не поощряем.
    } else if (outcome.speed === "fast") {
        next.box = Math.min(MAX_BOX, next.box + 1);
    } else if (outcome.speed === "slow") {
        // Досчитала. Это не автоматизм, откатываем на ступень назад.
        next.box = Math.max(0, next.box - 1);
    }
    // speed === "ok" — ступень на месте, показываем снова через тот же интервал.

    next.lastGraded = today;
    next.due = addDays(today, intervalFor(next.box));
    return next;
}
