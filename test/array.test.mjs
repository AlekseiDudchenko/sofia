import test from "node:test";
import assert from "node:assert/strict";
import { DECK } from "../web/js/facts.js";
import { ARRAY_MAX_PRODUCT, ARRAY_MAX_ROWS, hasArray, arrayShape, arrayHTML } from "../web/js/ui/array.js";

const rowsIn = (html) => html.split('class="arow"').length - 1;
const minionsIn = (html) => html.split('class="minion ').length - 1;
/** Миньоны первого ряда — сколько их «в ряду по». */
const firstRow = (html) => minionsIn(html.split('class="arow"')[1] ?? "");

test("строй повторяет пример: 2 × 4 — это два ряда по четыре", () => {
    const html = arrayHTML(2, 4);

    assert.equal(rowsIn(html), 2);
    assert.equal(firstRow(html), 4);
    assert.equal(minionsIn(html), 8);
});

test("перевёрнутый пример даёт перевёрнутый строй", () => {
    const html = arrayHTML(4, 2);

    assert.equal(rowsIn(html), 4);
    assert.equal(firstRow(html), 2);
    // Восьмёрка та же — это и есть переместительный закон на картинке.
    assert.equal(minionsIn(html), 8);
});

test("одноглазые и двуглазые идут вперемешку", () => {
    const html = arrayHTML(3, 3);
    const single = html.split('data-eyes="1"').length - 1;

    assert.ok(single > 0 && single < 9, `однглазых ${single} из девяти`);
});

test("подсказка есть только у примеров, которые ещё считают", () => {
    assert.ok(hasArray(2, 4));
    assert.ok(hasArray(5, 5), `${ARRAY_MAX_PRODUCT} — последний пример со строем`);
    assert.ok(!hasArray(4, 7), "28 больше порога");
    assert.ok(!hasArray(7, 8), "то, что учат наизусть, строем не объясняют");
});

test("длинный строй кладётся на бок: 9 × 2 показывается как 2 × 9", () => {
    // Девять рядов по два на экране телефона превращаются в девять полосок,
    // поэтому у обоих показов один и тот же строй.
    assert.deepEqual(arrayShape(9, 2), arrayShape(2, 9));
    assert.deepEqual(arrayShape(9, 2), { rows: 2, cols: 9 });
    assert.ok(hasArray(9, 2) && hasArray(2, 9));
});

test("рядов в строю никогда не больше пяти", () => {
    for (let left = 2; left <= 9; left++) {
        for (let right = 2; right <= 9; right++) {
            if (!hasArray(left, right)) continue;
            const { rows, cols } = arrayShape(left, right);

            assert.ok(rows <= ARRAY_MAX_ROWS, `${left} × ${right} дал ${rows} рядов`);
            assert.equal(rows * cols, left * right, `${left} × ${right} потерял миньонов`);
        }
    }
});

test("подсказка покрывает всю ×2 и не лезет в злое ядро", () => {
    const covered = (fact) => hasArray(fact.a, fact.b) && hasArray(fact.b, fact.a);

    // Удвоение считают чаще всего — строй нужен там во всех восьми примерах,
    // и в обоих показах: 2 × 9 и 9 × 2 получают одинаковую подсказку.
    for (const fact of DECK.filter((f) => f.a === 2 || f.b === 2)) {
        assert.ok(covered(fact), `${fact.id} остался без подсказки`);
    }

    // 6·7·8 учат наизусть: 42 миньона не пересчитать, и объяснять их строем
    // значит уговаривать считать вместо того, чтобы помнить.
    for (const fact of DECK.filter((f) => f.a >= 6 && f.b >= 6)) {
        assert.ok(!hasArray(fact.a, fact.b), `${fact.id} зря получил подсказку`);
    }
});
