import test from "node:test";
import assert from "node:assert/strict";
import { DECK } from "../web/js/facts.js";
import { newCard } from "../web/js/scheduler.js";
import {
    buildDrillQueue, introducedToday, masteredCount,
    sprintPool, sprintWeight, pickSprintFact, requeue,
    tickRetries, MARATHON_LIVES, MARATHON_RETRY_GAP,
} from "../web/js/session.js";

const TODAY = "2026-08-01";
const NEW_PER_DAY = 6;

function cardsFrom(entries) {
    return new Map(entries.map((c) => [c.id, c]));
}

test("в пустом состоянии выдаётся только дневная порция новых фактов", () => {
    const queue = buildDrillQueue(new Map(), TODAY, NEW_PER_DAY);
    assert.equal(queue.length, NEW_PER_DAY);
    assert.deepEqual(queue.map((f) => f.id), DECK.slice(0, NEW_PER_DAY).map((f) => f.id));
});

test("дневной лимит новых учитывает уже введённые сегодня", () => {
    const introduced = DECK.slice(0, 4).map((f) => newCard(f.id, TODAY));
    for (const c of introduced) c.due = "2026-08-05"; // не просрочены
    const cards = cardsFrom(introduced);

    assert.equal(introducedToday(cards, TODAY), 4);
    assert.equal(buildDrillQueue(cards, TODAY, NEW_PER_DAY).length, 2);
});

test("вчерашние карточки не съедают сегодняшний лимит новых", () => {
    const yesterday = DECK.slice(0, 6).map((f) => ({ ...newCard(f.id, "2026-07-31"), due: "2026-08-09" }));
    assert.equal(buildDrillQueue(cardsFrom(yesterday), TODAY, NEW_PER_DAY).length, NEW_PER_DAY);
});

test("просроченные повторения идут раньше новых, слабые — первыми", () => {
    const cards = cardsFrom([
        { ...newCard("2x2", "2026-07-01"), box: 4, due: TODAY },
        { ...newCard("2x3", "2026-07-01"), box: 0, due: "2026-07-30" },
        { ...newCard("2x4", "2026-07-01"), box: 2, due: TODAY },
    ]);
    const queue = buildDrillQueue(cards, TODAY, NEW_PER_DAY);

    assert.deepEqual(queue.slice(0, 3).map((f) => f.id), ["2x3", "2x4", "2x2"]);
    assert.equal(queue.length, 3 + NEW_PER_DAY);
});

test("не наступившие повторения в очередь не попадают", () => {
    const cards = cardsFrom([{ ...newCard("2x2", "2026-07-01"), box: 5, due: "2026-08-20" }]);
    const queue = buildDrillQueue(cards, TODAY, NEW_PER_DAY);
    assert.ok(!queue.some((f) => f.id === "2x2"));
});

test("выученными считаются только факты с высокой ступени", () => {
    const cards = cardsFrom([
        { ...newCard("2x2", TODAY), box: 5 },
        { ...newCard("2x3", TODAY), box: 6 },
        { ...newCard("2x4", TODAY), box: 4 },
    ]);
    assert.equal(masteredCount(cards), 2);
});

// ── Спринт ────────────────────────────────────────────────────────────────

test("спринт не подсовывает незнакомые факты, когда введено достаточно", () => {
    const seen = DECK.slice(0, 12).map((f) => newCard(f.id, TODAY));
    const pool = sprintPool(cardsFrom(seen));
    assert.equal(pool.length, 12);
    assert.ok(pool.every((f) => seen.some((c) => c.id === f.id)));
});

test("в первый день спринт работает по лёгкому началу колоды", () => {
    assert.equal(sprintPool(new Map()).length, 8);
});

test("слабые факты весят больше сильных", () => {
    assert.ok(sprintWeight({ box: 0 }) > sprintWeight({ box: 5 }));
    assert.equal(sprintWeight(undefined), 4);
});

test("один и тот же пример не выпадает дважды подряд", () => {
    const pool = DECK.slice(0, 5);
    const cards = new Map();
    for (let i = 0; i < 20; i++) {
        const picked = pickSprintFact(pool, cards, () => i / 20, "2x2");
        assert.notEqual(picked.id, "2x2");
    }
});

test("выбор укладывается в пул при любом значении генератора", () => {
    const pool = DECK.slice(0, 5);
    const cards = new Map();
    for (const r of [0, 0.25, 0.5, 0.999999, 1]) {
        const picked = pickSprintFact(pool, cards, () => r);
        assert.ok(pool.includes(picked), `выбор вне пула при rng=${r}`);
    }
});

// ── Марафон ───────────────────────────────────────────────────────────────

test("в марафоне три жизни, а переспрос ближе, чем в тренировке", () => {
    assert.equal(MARATHON_LIVES, 3);
    assert.ok(MARATHON_RETRY_GAP < 4);
});

test("ошибочный факт возвращается ровно через заданное число примеров", () => {
    let retries = [{ fact: DECK[0], after: 3 }];
    for (let i = 0; i < 2; i++) {
        const step = tickRetries(retries);
        assert.equal(step.due, null, `факт вернулся раньше срока: шаг ${i + 1}`);
        retries = step.rest;
    }
    assert.equal(tickRetries(retries).due, DECK[0]);
});

test("за один пример возвращается только один факт", () => {
    const step = tickRetries([
        { fact: DECK[0], after: 1 },
        { fact: DECK[1], after: 1 },
    ]);
    assert.equal(step.due, DECK[0]);
    assert.deepEqual(step.rest.map((r) => r.fact.id), [DECK[1].id]);
    // Второй не потерялся и придёт следующим.
    assert.equal(tickRetries(step.rest).due, DECK[1]);
});

test("пустая очередь переспросов ничего не выдаёт", () => {
    assert.deepEqual(tickRetries([]), { due: null, rest: [] });
});

test("tickRetries не мутирует исходную очередь", () => {
    const retries = [{ fact: DECK[0], after: 2 }];
    tickRetries(retries);
    assert.equal(retries[0].after, 2);
});

// ── Переспрос внутри сессии ───────────────────────────────────────────────

test("ошибочный факт возвращается через несколько примеров, а не в конец", () => {
    const queue = ["a", "b", "c", "d", "e", "f"];
    assert.deepEqual(requeue(queue, "x", 4), ["a", "b", "c", "d", "x", "e", "f"]);
});

test("в короткой очереди переспрос встаёт в конец и не теряется", () => {
    assert.deepEqual(requeue(["a"], "x", 4), ["a", "x"]);
    assert.deepEqual(requeue([], "x", 4), ["x"]);
});

test("requeue не мутирует исходную очередь", () => {
    const queue = ["a", "b"];
    requeue(queue, "x", 1);
    assert.deepEqual(queue, ["a", "b"]);
});
