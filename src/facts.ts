/** Колода фактов таблицы умножения 2–9.
 *
 * 7×8 и 8×7 — это одна карточка: в 11 лет коммутативность уже не новость,
 * и дублировать её значит удвоить колоду ради нуля пользы. Порядок
 * множителей в вопросе рандомизируется при показе (см. randomOrientation),
 * так что обе формы всё равно встречаются.
 */

export const MIN_FACTOR = 2;
export const MAX_FACTOR = 9;

export interface Fact {
    /** Канонический id вида "6x7" — меньший множитель всегда первый. */
    id: string;
    a: number;
    b: number;
    product: number;
}

export function factId(x: number, y: number): string {
    return x <= y ? `${x}x${y}` : `${y}x${x}`;
}

/** Порядок ввода новых фактов — от простого к сложному, а не по номерам.
 *
 * Столбики идут группами: сначала те, где есть опора (удвоение, круглые
 * пятёрки, приём девятки), и только потом «злое ядро» 6·7·8, на которое
 * приходится большая часть всех ошибок. Девятка стоит рано намеренно:
 * ×9 = ×10 − число, поэтому она даётся легче семёрки, хотя множитель больше.
 */
const INTRO_ORDER: ReadonlyArray<readonly [number, number]> = [
    // ×2 — удвоение, опора уже есть
    [2, 2], [2, 3], [2, 4], [2, 5], [2, 6], [2, 7], [2, 8], [2, 9],
    // ×5 — круглые окончания 0/5
    [5, 5], [3, 5], [4, 5], [5, 6], [5, 7], [5, 8], [5, 9],
    // ×9 — приём «на десятку минус число», сумма цифр всегда 9
    [9, 9], [3, 9], [4, 9], [6, 9], [7, 9], [8, 9],
    // ×3
    [3, 3], [3, 4], [3, 6], [3, 7], [3, 8],
    // ×4 — удвоить дважды
    [4, 4], [4, 6], [4, 7], [4, 8],
    // ×6, ×7, ×8 — то, что реально приходится заучивать
    [6, 6], [6, 7], [6, 8],
    [7, 7], [7, 8],
    [8, 8],
];

function makeFact(a: number, b: number): Fact {
    return { id: factId(a, b), a, b, product: a * b };
}

/** Все 36 фактов в порядке ввода. */
export const DECK: readonly Fact[] = INTRO_ORDER.map(([a, b]) => makeFact(a, b));

const BY_ID = new Map<string, Fact>(DECK.map((f) => [f.id, f]));

export function factById(id: string): Fact | undefined {
    return BY_ID.get(id);
}

export function factFor(x: number, y: number): Fact | undefined {
    return BY_ID.get(factId(x, y));
}

/** Как показать пример: половину раз множители переставлены местами. */
export function orientation(fact: Fact, flip: boolean): { left: number; right: number } {
    return flip ? { left: fact.b, right: fact.a } : { left: fact.a, right: fact.b };
}
