/* Офлайн держится на том, что в SHELL сервис-воркера перечислено всё, что
 * приложению нужно для запуска. Стоит модулю выпасть из списка — обновление
 * версии выкинет его из кэша, и первый же офлайн после обновления даст белый
 * экран. Проверяем сам инвариант, а не то, как он получился. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { collectModules, stampModules, stampVersion } from "../scripts/stamp-version.mjs";

const root = new URL("../", import.meta.url);
const sw = readFileSync(new URL("web/sw.js", root), "utf8");

/** Пути из константы MODULES живого web/sw.js. */
function listedModules(source) {
    const block = source.match(/const MODULES = \[([^\]]*)\];/);
    assert.ok(block, "в web/sw.js нет константы MODULES");
    return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

test("в SHELL перечислены все скомпилированные модули", () => {
    const built = collectModules(new URL("web/js/", root));
    assert.ok(built.length > 0, "web/js пуст — сначала нужен npm run build");
    // Не подмножество, а равенство: лишний путь в списке уронит cache.addAll
    // целиком, и офлайн не заработает вовсе.
    assert.deepEqual(listedModules(sw), built);
});

test("модули действительно попадают в SHELL, а не только в MODULES", () => {
    assert.match(sw, /const SHELL = \[[^\]]*\.\.\.MODULES,\s*\]/);
});

test("версия в sw.js совпадает с package.json", () => {
    const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
    assert.match(sw, new RegExp(`const VERSION = "${version.replace(/\./g, "\\.")}";`));
});

test("пустой список модулей не проходит: это забытая сборка, а не пустой SHELL", () => {
    assert.throws(() => stampModules(sw, []), /не найдено ни одного модуля/);
});

test("подстановка ругается, когда в sw.js нет нужного блока", () => {
    assert.throws(() => stampModules("пусто", ["./js/main.js"]), /не найден блок/);
    assert.throws(() => stampVersion("пусто", "1.2.3"), /не найдена строка/);
});

test("версия не вида MAJOR.MINOR.PATCH отвергается", () => {
    assert.throws(() => stampVersion(sw, "0.2"), /MAJOR\.MINOR\.PATCH/);
    assert.throws(() => stampVersion(sw, "0.2.0-beta"), /MAJOR\.MINOR\.PATCH/);
});

test("список модулей отсортирован и не зависит от порядка обхода файлов", () => {
    const built = collectModules(new URL("web/js/", root));
    assert.deepEqual(built, [...built].sort());
    assert.ok(built.every((m) => m.startsWith("./js/") && m.endsWith(".js")));
});
