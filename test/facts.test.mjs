import test from "node:test";
import assert from "node:assert/strict";
import { DECK, MIN_FACTOR, MAX_FACTOR, factId, factFor, orientation } from "../web/js/facts.js";

test("колода покрывает ровно все неупорядоченные пары 2–9", () => {
    const expected = new Set();
    for (let a = MIN_FACTOR; a <= MAX_FACTOR; a++) {
        for (let b = a; b <= MAX_FACTOR; b++) expected.add(`${a}x${b}`);
    }
    const actual = new Set(DECK.map((f) => f.id));

    assert.equal(DECK.length, 36);
    assert.equal(actual.size, 36, "в колоде есть дубликаты");
    assert.deepEqual([...actual].sort(), [...expected].sort());
});

test("id нормализован: 7×8 и 8×7 — одна карточка", () => {
    assert.equal(factId(8, 7), "7x8");
    assert.equal(factId(7, 8), "7x8");
    assert.equal(factFor(8, 7), factFor(7, 8));
});

test("произведение совпадает с множителями", () => {
    for (const f of DECK) assert.equal(f.product, f.a * f.b);
});

test("порядок ввода начинается с ×2 и заканчивается ядром 6·7·8", () => {
    const firstEight = DECK.slice(0, 8);
    assert.ok(firstEight.every((f) => f.a === 2), "первым идёт столбик двойки");

    const lastFive = DECK.slice(-5).map((f) => f.id);
    for (const id of lastFive) {
        const [a, b] = id.split("x").map(Number);
        assert.ok(a >= 6 && b >= 6, `${id} не относится к самому трудному блоку`);
    }
});

test("ориентация переставляет множители", () => {
    const fact = factFor(6, 7);
    assert.deepEqual(orientation(fact, false), { left: 6, right: 7 });
    assert.deepEqual(orientation(fact, true), { left: 7, right: 6 });
});
