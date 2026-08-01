import test from "node:test";
import assert from "node:assert/strict";
import { grade, FAST_MS, OK_MS, DISTRACTED_MS } from "../web/js/rating.js";
import {
    newCard, applyOutcome, addDays, intervalFor, isMastered,
    MASTERED_BOX, MAX_BOX,
} from "../web/js/scheduler.js";

const TODAY = "2026-08-01";

function outcome(correct, latencyMs) {
    const g = grade(correct, latencyMs);
    return { ...g, latencyMs };
}

// ── Оценка по скорости ────────────────────────────────────────────────────

test("быстрый верный ответ — автоматизм", () => {
    assert.equal(grade(true, 900).speed, "fast");
});

test("верный ответ на границе автоматизма считается обычным", () => {
    assert.equal(grade(true, FAST_MS).speed, "ok");
});

test("верный, но долгий ответ — досчитала, а не вспомнила", () => {
    assert.equal(grade(true, OK_MS + 1).speed, "slow");
});

test("очень долгая пауза помечается как недостоверный тайминг", () => {
    const g = grade(true, DISTRACTED_MS + 5000);
    assert.equal(g.timingTrusted, false);
    assert.equal(g.speed, "ok", "отвлеклась — не наказываем как за счёт на пальцах");
});

// ── Лестница ──────────────────────────────────────────────────────────────

test("ступень растёт только от быстрого ответа", () => {
    const card = newCard("7x8", TODAY);
    assert.equal(applyOutcome(card, outcome(true, 800), TODAY).box, 1);
});

test("обычный по скорости ответ оставляет ступень на месте", () => {
    const card = { ...newCard("7x8", TODAY), box: 3 };
    assert.equal(applyOutcome(card, outcome(true, 3000), TODAY).box, 3);
});

test("медленный ответ откатывает на ступень назад", () => {
    const card = { ...newCard("7x8", TODAY), box: 3 };
    assert.equal(applyOutcome(card, outcome(true, 9000), TODAY).box, 2);
});

test("ошибка сбрасывает факт в начало лестницы", () => {
    const card = { ...newCard("7x8", TODAY), box: 5 };
    const next = applyOutcome(card, outcome(false, 1200), TODAY);
    assert.equal(next.box, 0);
    assert.equal(next.wrong, 1);
    assert.equal(next.due, addDays(TODAY, 1));
});

test("ступень не поднимается выше максимума", () => {
    const card = { ...newCard("7x8", TODAY), box: MAX_BOX };
    assert.equal(applyOutcome(card, outcome(true, 500), TODAY).box, MAX_BOX);
});

test("до «выучено» нужно пять быстрых ответов в разные дни", () => {
    let card = newCard("7x8", TODAY);
    let day = TODAY;
    for (let i = 0; i < MASTERED_BOX; i++) {
        card = applyOutcome(card, outcome(true, 700), day);
        day = addDays(day, 1);
    }
    assert.ok(isMastered(card), "пять быстрых ответов должны давать автоматизм");

    // А те же пять ответов, но обычной скорости, автоматизма не дают.
    let slowCard = newCard("6x7", TODAY);
    let slowDay = TODAY;
    for (let i = 0; i < MASTERED_BOX; i++) {
        slowCard = applyOutcome(slowCard, outcome(true, 4000), slowDay);
        slowDay = addDays(slowDay, 1);
    }
    assert.ok(!isMastered(slowCard));
});

test("второй ответ за тот же день не двигает расписание", () => {
    const first = applyOutcome(newCard("7x8", TODAY), outcome(true, 700), TODAY);
    const second = applyOutcome(first, outcome(true, 700), TODAY);

    assert.equal(second.box, first.box, "ступень не должна расти дважды за день");
    assert.equal(second.due, first.due);
    assert.equal(second.reps, 2, "но ответ всё равно засчитан в статистику");
});

test("переспрос после ошибки в той же сессии не воскрешает карточку", () => {
    // Ровно тот сценарий, ради которого правило и введено: ошиблась,
    // через четыре примера ответила верно — факт обязан остаться сброшенным.
    const card = { ...newCard("7x8", TODAY), box: 4 };
    const afterMiss = applyOutcome(card, outcome(false, 3000), TODAY);
    const afterRetry = applyOutcome(afterMiss, outcome(true, 800), TODAY);

    assert.equal(afterRetry.box, 0);
    assert.ok(!isMastered(afterRetry));
});

test("интервал растёт со ступенью", () => {
    const intervals = [0, 1, 2, 3, 4, 5, 6].map(intervalFor);
    for (let i = 2; i < intervals.length; i++) {
        assert.ok(intervals[i] > intervals[i - 1], `интервал ${i} не больше предыдущего`);
    }
    assert.equal(intervalFor(MAX_BOX), 32);
});

test("addDays переходит через границу месяца", () => {
    assert.equal(addDays("2026-08-31", 1), "2026-09-01");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-02-28", 1), "2028-02-29");
});

test("лучшее время обновляется только вниз", () => {
    let card = newCard("7x8", TODAY);
    card = applyOutcome(card, outcome(true, 1500), TODAY);
    assert.equal(card.bestMs, 1500);
    card = applyOutcome(card, outcome(true, 2500), TODAY);
    assert.equal(card.bestMs, 1500);
    card = applyOutcome(card, outcome(true, 900), TODAY);
    assert.equal(card.bestMs, 900);
});
