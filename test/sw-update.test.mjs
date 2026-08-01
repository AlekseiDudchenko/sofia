/* Сообщение о новой версии держится на договорённости между страницей и
 * сервис-воркером: воркер ждёт, страница просит его перестать ждать. Обе
 * стороны — разные файлы, и молча разъехаться им ничего не мешает. Проверяем
 * сам договор; поведение целиком проверяет e2e-тест «сообщение о новой версии». */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const sw = readFileSync(new URL("web/sw.js", root), "utf8");
const client = readFileSync(new URL("src/update.ts", root), "utf8");

/** Тело обработчика install из web/sw.js. */
function installHandler(source) {
    const match = source.match(/addEventListener\("install",[\s\S]*?\n\}\);/);
    assert.ok(match, "в web/sw.js нет обработчика install");
    return match[0];
}

test("install не активирует новую версию сам", () => {
    // skipWaiting() в install означал бы, что новая версия встаёт посреди
    // сеанса: activate сносит кэш старой, а страница живёт на её модулях.
    // Спрашивать про обновление после этого уже поздно.
    assert.doesNotMatch(installHandler(sw), /skipWaiting/);
});

test("воркер снимает ожидание по сообщению страницы", () => {
    assert.match(sw, /addEventListener\("message"/);
    assert.match(sw, /skipWaiting\(\)/);
});

test("страница и воркер называют сообщение одинаково", () => {
    const inWorker = sw.match(/event\.data\?\.type === "([^"]+)"/);
    const inClient = client.match(/postMessage\(\{ type: "([^"]+)" \}\)/);
    assert.ok(inWorker, "в web/sw.js не найдена проверка типа сообщения");
    assert.ok(inClient, "в src/update.ts не найден postMessage с типом");
    assert.equal(inClient[1], inWorker[1]);
});

test("страница перезагружается по controllerchange, а не сразу по нажатию", () => {
    // Перезагрузка до смены воркера вернула бы ту же сборку из старого кэша.
    assert.match(client, /addEventListener\("controllerchange"/);
});
