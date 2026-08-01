/** Сборка очередей для тренировки и спринта. Чистые функции: всё состояние
 * приходит аргументами, случайность — инъекцией, поэтому тестируется без DOM. */

import { DECK, type Fact } from "./facts.js";
import { NEW_PER_DAY, isMastered, type CardState } from "./scheduler.js";

export type CardMap = ReadonlyMap<string, CardState>;

export type Rng = () => number;

/** Сколько новых фактов уже введено сегодня. */
export function introducedToday(cards: CardMap, today: string): number {
    let n = 0;
    for (const card of cards.values()) if (card.firstSeen === today) n++;
    return n;
}

/** Очередь дневной тренировки: сначала просроченные повторения (слабые
 * впереди), затем новые факты в порядке возрастания сложности. */
export function buildDrillQueue(cards: CardMap, today: string, newPerDay = NEW_PER_DAY): Fact[] {
    const due: Fact[] = [];
    const fresh: Fact[] = [];

    for (const fact of DECK) {
        const card = cards.get(fact.id);
        if (!card) fresh.push(fact);
        else if (card.due <= today) due.push(fact);
    }

    // Слабые факты первыми: пока внимание свежее, работаем над тем, что не идёт.
    due.sort((x, y) => {
        const a = cards.get(x.id)!;
        const b = cards.get(y.id)!;
        return a.box - b.box || (a.due < b.due ? -1 : a.due > b.due ? 1 : 0);
    });

    const allowance = Math.max(0, newPerDay - introducedToday(cards, today));
    return [...due, ...fresh.slice(0, allowance)];
}

export function dueCount(cards: CardMap, today: string): number {
    return buildDrillQueue(cards, today).length;
}

export function masteredCount(cards: CardMap): number {
    let n = 0;
    for (const fact of DECK) if (isMastered(cards.get(fact.id))) n++;
    return n;
}

/** Факты, доступные спринту: только уже введённые — под таймером незнакомый
 * пример даёт не тренировку, а панику. Пока введено слишком мало, спринт
 * работает по лёгкому началу колоды, чтобы игра была доступна с первого дня. */
export function sprintPool(cards: CardMap): Fact[] {
    const seen = DECK.filter((f) => cards.has(f.id));
    return seen.length >= 8 ? seen : DECK.slice(0, 8);
}

/** Вес факта при случайном выборе в спринте: чем ниже ступень, тем чаще. */
export function sprintWeight(card: CardState | undefined): number {
    if (!card) return 4;
    return Math.max(1, 7 - card.box);
}

/** Взвешенный случайный выбор, исключая последний показанный факт, чтобы
 * один и тот же пример не выпадал дважды подряд. */
export function pickSprintFact(pool: Fact[], cards: CardMap, rng: Rng, exclude?: string): Fact {
    const candidates = pool.length > 1 && exclude ? pool.filter((f) => f.id !== exclude) : pool;
    const weights = candidates.map((f) => sprintWeight(cards.get(f.id)));
    const total = weights.reduce((s, w) => s + w, 0);

    let roll = rng() * total;
    for (let i = 0; i < candidates.length; i++) {
        roll -= weights[i]!;
        if (roll < 0) return candidates[i]!;
    }
    return candidates[candidates.length - 1]!;
}

/** Куда вернуть неверно отвеченный факт внутри текущей сессии.
 *
 * Не в конец очереди: к концу тренировки ребёнок устал, и повтор попадёт в
 * худший момент. Через несколько примеров — достаточно, чтобы ответ не был
 * ещё в оперативной памяти, и достаточно скоро, чтобы связать с ошибкой. */
export const REQUEUE_GAP = 4;

export function requeue<T>(queue: T[], item: T, gap = REQUEUE_GAP): T[] {
    const next = queue.slice();
    next.splice(Math.min(gap, next.length), 0, item);
    return next;
}
