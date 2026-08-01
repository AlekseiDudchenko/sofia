/* Готовит web/sw.js к публикации: проставляет версию из package.json и
 * собирает список скомпилированных модулей.
 *
 * Версия — чтобы сменилось имя кэша и пользователь не остался на старой
 * сборке. Список модулей — чтобы новый кэш наполнялся целиком: activate
 * сносит старый кэш, и всё, чего нет в SHELL, до следующего запуска живёт
 * только в сети.
 *
 * Результат коммитится вместе с исходниками: в CI стоит `git diff
 * --exit-code`, поэтому забытая пересборка после нового модуля в src/ уронит
 * сборку, а не уедет в прод молча.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = new URL("../", import.meta.url);

/** Все .js из web/js в порядке, не зависящем от файловой системы. */
export function collectModules(dir) {
    const walk = (current, prefix) => {
        const entries = readdirSync(current, { withFileTypes: true });
        const found = [];
        for (const entry of entries) {
            const nested = path.join(current, entry.name);
            if (entry.isDirectory()) found.push(...walk(nested, `${prefix}${entry.name}/`));
            else if (entry.name.endsWith(".js")) found.push(`${prefix}${entry.name}`);
        }
        return found;
    };

    return walk(fileURLToPath(dir), "./js/").sort();
}

export function stampVersion(source, version) {
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`версия должна быть вида MAJOR.MINOR.PATCH, а не "${version}"`);
    }

    const stamped = source.replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`);
    if (!stamped.includes(`const VERSION = "${version}";`)) {
        throw new Error("в web/sw.js не найдена строка с константой VERSION");
    }
    return stamped;
}

export function stampModules(source, modules) {
    if (modules.length === 0) {
        // Пустой список означал бы «ничего не кэшировать» — вернее всего, что
        // просто забыли собрать. Молча стирать SHELL нельзя.
        throw new Error("в web/js не найдено ни одного модуля — сначала нужен tsc");
    }

    const block = `const MODULES = [\n${modules.map((m) => `    "${m}",`).join("\n")}\n];`;
    const stamped = source.replace(/const MODULES = \[[^\]]*\];/, block);
    if (!stamped.includes(block)) {
        throw new Error("в web/sw.js не найден блок с константой MODULES");
    }
    return stamped;
}

function main() {
    const { version } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
    const modules = collectModules(new URL("web/js/", root));

    const swPath = new URL("web/sw.js", root);
    const source = readFileSync(swPath, "utf8");
    const stamped = stampModules(stampVersion(source, version), modules);

    // Пишем только при изменении, чтобы обычная сборка не пачкала рабочее дерево.
    if (stamped !== source) {
        writeFileSync(swPath, stamped);
        console.log(`Service worker обновлён: версия ${version}, модулей ${modules.length}`);
    }
}

// Тесты импортируют функции по отдельности — при импорте ничего не пишем.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main();
}
