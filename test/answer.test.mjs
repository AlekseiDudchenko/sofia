import test from "node:test";
import assert from "node:assert/strict";
import { checkInput } from "../web/js/answer.js";

test("пустой ввод — ещё не ответ", () => {
    assert.equal(checkInput("", 56), "pending");
});

test("полное совпадение — верно", () => {
    assert.equal(checkInput("56", 56), "correct");
    assert.equal(checkInput("6", 6), "correct");
});

test("префикс двузначного ответа — ждём вторую цифру", () => {
    assert.equal(checkInput("6", 63), "pending");
    assert.equal(checkInput("8", 81), "pending");
});

test("не префикс — ошибка сразу, без кнопки «готово»", () => {
    assert.equal(checkInput("7", 63), "wrong");
    assert.equal(checkInput("16", 12), "wrong");
});

test("однозначный ответ засчитывается сразу и не ждёт второй цифры", () => {
    // 2×3=6: «6» обязано быть correct, а не pending, иначе ввод повиснет.
    assert.equal(checkInput("6", 6), "correct");
    assert.equal(checkInput("4", 4), "correct");
});

test("лишняя цифра поверх верного ответа — ошибка", () => {
    assert.equal(checkInput("566", 56), "wrong");
});
