/* Проставляет версию из package.json в service worker.
 * Без этого имя кэша не меняется и пользователь остаётся на старой сборке. */
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));

if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`версия должна быть вида MAJOR.MINOR.PATCH, а не "${version}"`);
}

const swPath = new URL("web/sw.js", root);
const source = readFileSync(swPath, "utf8");
const stamped = source.replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`);

if (!stamped.includes(`const VERSION = "${version}";`)) {
    throw new Error("в web/sw.js не найдена строка с константой VERSION");
}

// Пишем только при изменении, чтобы обычная сборка не пачкала рабочее дерево.
if (stamped !== source) {
    writeFileSync(swPath, stamped);
    console.log(`Версия в service worker обновлена: ${version}`);
}
