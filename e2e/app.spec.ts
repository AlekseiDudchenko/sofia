import { test, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { connect } from "node:net";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

/** Ждёт, пока порт начнёт (up = true) или перестанет принимать соединения. */
async function waitForServer(port: number, up: boolean): Promise<void> {
    for (let i = 0; i < 100; i++) {
        const listening = await new Promise<boolean>((resolve) => {
            const socket = connect({ port, host: "127.0.0.1" });
            socket.on("connect", () => { socket.destroy(); resolve(true); });
            socket.on("error", () => resolve(false));
        });
        if (listening === up) return;
        await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`сервер на порту ${port} так и не ${up ? "поднялся" : "погас"}`);
}

/** Читает текущий пример с экрана и возвращает правильный ответ. */
async function currentProduct(page: Page): Promise<number> {
    const question = await page.locator("#question").textContent();
    const [a, b] = question!.split("×").map((part) => Number(part.trim()));
    return a! * b!;
}

async function type(page: Page, value: number | string): Promise<void> {
    for (const digit of String(value)) await page.click(`[data-key="${digit}"]`);
}

test.beforeEach(async ({ page }) => {
    await page.goto("/");
});

test("на главной видны обе тренировки и пустая карта", async ({ page }) => {
    await expect(page.locator('[data-act="drill"]')).toContainText("Тренировка");
    await expect(page.locator('[data-act="sprint"]')).toContainText("Спринт");
    await expect(page.locator(".map-head span")).toHaveText("0 из 36 на автомате");
    // Ровно 81 клетка: 8×8 фактов плюс заголовки строк и столбцов.
    await expect(page.locator(".grid .cell")).toHaveCount(81);
});

test("верный ответ засчитывается без кнопки «готово»", async ({ page }) => {
    await page.click('[data-act="drill"]');
    await type(page, await currentProduct(page));
    await expect(page.locator(".slot")).toHaveClass(/correct/);
});

test("неверная цифра отбраковывается сразу и показывает правильный ответ", async ({ page }) => {
    await page.click('[data-act="drill"]');
    const product = await currentProduct(page);
    const wrongDigit = String(product)[0] === "9" ? "1" : "9";

    await type(page, wrongDigit);
    await expect(page.locator(".slot")).toHaveClass(/wrong/);
    await expect(page.locator(".hint")).toContainText(`= ${product}`);
});

test("незавершённое двузначное число ответом не считается", async ({ page }) => {
    await page.click('[data-act="drill"]');
    // Ищем пример с двузначным ответом: набираем первую цифру и убеждаемся,
    // что экран ждёт вторую, а не выносит вердикт.
    for (let i = 0; i < 12; i++) {
        const product = await currentProduct(page);
        if (product >= 10) {
            await type(page, String(product)[0]!);
            await expect(page.locator(".slot")).not.toHaveClass(/correct|wrong/);
            await type(page, String(product)[1]!);
            await expect(page.locator(".slot")).toHaveClass(/correct/);
            return;
        }
        await type(page, product);
        await page.waitForTimeout(600);
    }
    throw new Error("двузначный ответ так и не встретился");
});

test("тренировка доходит до итогов, а прогресс переживает переход на главную", async ({ page }) => {
    await page.click('[data-act="drill"]');
    // count() не ждёт появления элемента, поэтому без этой строки цикл может
    // не начаться: на быстром раннере проверка обгоняет отрисовку экрана.
    await page.waitForSelector("#question");

    for (let i = 0; i < 30 && (await page.locator("#question").count()) > 0; i++) {
        await type(page, await currentProduct(page));
        await page.waitForTimeout(550);
    }

    await expect(page.locator(".result .big")).toBeVisible();
    await page.click('[data-act="home"]');

    // Дневной счётчик и карта заполняются из localStorage — бэкенда нет.
    await expect(page.locator(".daily-head b")).toHaveText("6 / 30");
    await expect(page.locator(".cell.b-low, .cell.b-mid")).not.toHaveCount(0);
});

/* Экран тренировки обязан помещаться целиком: нижний ряд клавиатуры за краем
 * экрана — это невозможность ответить, а не косметика. */
for (const viewport of [
    { name: "низкий экран", width: 320, height: 568 },
    { name: "альбомная ориентация", width: 740, height: 360 },
]) {
    test(`клавиатура помещается на экране: ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.click('[data-act="drill"]');
        await page.waitForSelector("#question");

        const box = (await page.locator(".keypad").boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        // Прокрутки на экране тренировки быть не должно вовсе.
        const overflow = await page.evaluate(() => ({
            y: document.documentElement.scrollHeight - window.innerHeight,
            x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }));
        expect(overflow.y).toBeLessThanOrEqual(0);
        // Верхняя панель обросла кнопкой звука — по ширине она тоже обязана влезть.
        expect(overflow.x).toBeLessThanOrEqual(0);
    });
}

/* Звук синтезируется в Web Audio, проверить сам сигнал в браузерном тесте
 * нельзя. Проверяем то, что ломается на практике: узлы действительно
 * создаются, тренировка не падает без звука и выбор переживает перезагрузку. */
test.describe("звук", () => {
    test("по умолчанию включён, выключается и переживает перезагрузку", async ({ page }) => {
        const toggle = page.locator('[data-act="sound"]');
        await expect(toggle).toHaveAttribute("aria-pressed", "true");

        await toggle.click();
        await expect(toggle).toHaveAttribute("aria-pressed", "false");
        await expect(toggle.locator(".sound-ic")).toHaveText("🔇");

        await page.reload();
        await expect(page.locator('[data-act="sound"]')).toHaveAttribute("aria-pressed", "false");
    });

    test("ответ в тренировке запускает осциллятор", async ({ page }) => {
        await page.addInitScript(() => {
            const started: number[] = [];
            (window as unknown as { __osc: number[] }).__osc = started;
            const create = AudioContext.prototype.createOscillator;
            AudioContext.prototype.createOscillator = function patched(this: AudioContext) {
                started.push(Date.now());
                return create.call(this);
            };
        });
        await page.goto("/");

        await page.click('[data-act="drill"]');
        await type(page, await currentProduct(page));
        await expect(page.locator(".slot")).toHaveClass(/correct/);

        const count = await page.evaluate(() => (window as unknown as { __osc: number[] }).__osc.length);
        expect(count).toBeGreaterThan(0);
    });

    test("выключение прямо на тренировке не сбрасывает текущий пример", async ({ page }) => {
        await page.click('[data-act="drill"]');
        await page.waitForSelector("#question");
        const before = await page.locator("#question").textContent();

        await page.click('[data-act="sound"]');

        await expect(page.locator('[data-act="sound"]')).toHaveAttribute("aria-pressed", "false");
        await expect(page.locator("#question")).toHaveText(before!);
        // Ответ по-прежнему принимается — панель не перехватила клавиатуру.
        await type(page, await currentProduct(page));
        await expect(page.locator(".slot")).toHaveClass(/correct/);
    });

    test("с выключенным звуком тренировка работает и осцилляторов нет", async ({ page }) => {
        await page.click('[data-act="sound"]');
        await page.addInitScript(() => {
            const started: number[] = [];
            (window as unknown as { __osc: number[] }).__osc = started;
            const create = AudioContext.prototype.createOscillator;
            AudioContext.prototype.createOscillator = function patched(this: AudioContext) {
                started.push(Date.now());
                return create.call(this);
            };
        });
        await page.goto("/");

        await page.click('[data-act="drill"]');
        await type(page, await currentProduct(page));
        await expect(page.locator(".slot")).toHaveClass(/correct/);

        const count = await page.evaluate(() => (window as unknown as { __osc: number[] }).__osc.length);
        expect(count).toBe(0);
    });
});


/* Контейнер #app один на все экраны, и обработчики кликов копились на нём от
 * экрана к экрану. Пока имена действий у экранов не пересекались, это было
 * незаметно; одно и то же «sound» в настройках и в панели тренировки стало
 * срабатывать дважды за клик — то есть не срабатывать вовсе. */
test("действие с общим именем не срабатывает дважды после смены экрана", async ({ page }) => {
    await page.click('[data-act="drill"]');
    await page.waitForSelector("#question");

    await page.click('[data-act="sound"]');
    await expect(page.locator('[data-act="sound"]')).toHaveAttribute("aria-pressed", "false");
    expect(await page.evaluate(() => localStorage.getItem("sofia.sound.v1"))).toBe('{"on":false}');
});

/* Обещание «интернет нужен один раз» — не лозунг с главной, а поведение.
 *
 * Первая загрузка идёт мимо сервис-воркера: он в этот момент только ставится
 * и наполняет кэш списком SHELL. Значит, офлайн после неё поднимется ровно
 * настолько, насколько SHELL полон. Пока в нём лежал один main.js, тренировка
 * без сети упиралась в белый экран: import router.js уходил в мёртвую сеть.
 *
 * Сеть рвём по-настоящему, гася сервер. context.setOffline() здесь бесполезен:
 * он глушит запросы страницы, но не запросы сервис-воркера — тот продолжает
 * ходить в сеть, и тест проходит независимо от содержимого кэша. */
test("после первой загрузки приложение работает без сети", async ({ browser }) => {
    const port = 5199;
    const server = spawn("node", ["scripts/dev-server.mjs"], {
        cwd: fileURLToPath(new URL("..", import.meta.url)),
        env: { ...process.env, PORT: String(port) },
        stdio: "ignore",
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await waitForServer(port, true);
        await page.goto(`http://localhost:${port}/`);
        // Воркер встал и разложил SHELL по кэшу.
        await page.evaluate(() => navigator.serviceWorker.ready);
        await expect(page.locator('[data-act="drill"]')).toBeVisible();

        server.kill("SIGKILL");
        await waitForServer(port, false);

        await page.reload();
        // Главная собирается модулями из web/js — если хоть одного нет в кэше,
        // приложение не отрисуется вовсе.
        await expect(page.locator('[data-act="drill"]')).toBeVisible();
        await expect(page.locator(".grid .cell")).toHaveCount(81);

        // И тренировка тоже: её экран тянет ещё несколько модулей.
        await page.click('[data-act="drill"]');
        await page.waitForSelector("#question");
        await type(page, await currentProduct(page));
        await expect(page.locator(".slot")).toHaveClass(/correct/);
    } finally {
        server.kill("SIGKILL");
        await context.close();
    }
});

/* Сообщение о новой версии.
 *
 * Проверить его можно только настоящим обновлением: браузер сам решает, когда
 * считать sw.js изменившимся, и подделать это со стороны страницы нельзя.
 * Поэтому поднимаем свой сервер поверх web/ и на лету подменяем в sw.js версию
 * — ровно то, что делает выпуск.
 *
 * Общий dev-сервер для этого не годится: тесты идут параллельно, а сменившаяся
 * версия сбросила бы кэш и остальным. */
const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
};

function serveWeb(port: number, version: () => string): Server {
    const root = fileURLToPath(new URL("../web/", import.meta.url));

    return createServer(async (req, res) => {
        const path = normalize(new URL(req.url ?? "/", "http://localhost").pathname)
            .replace(/^(\.\.[/\\])+/, "");
        const file = join(root, path.endsWith("/") ? `${path}index.html` : path);

        try {
            const raw = await readFile(file);
            const body = file.endsWith("sw.js")
                ? raw.toString("utf8").replace(/const VERSION = "[^"]*";/, `const VERSION = "${version()}";`)
                : raw;
            res.writeHead(200, {
                "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
                "Cache-Control": "no-store",
            });
            res.end(body);
        } catch {
            res.writeHead(404).end("not found");
        }
    }).listen(port);
}

test("о новой версии сообщают, а не подменяют её молча", async ({ browser }) => {
    const port = 5197;
    let version = "9.9.8";
    const server = serveWeb(port, () => version);

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        await waitForServer(port, true);
        await page.goto(`http://localhost:${port}/`);
        // Ждём не просто установки, а именно контроля над страницей: до него
        // приложение не отличит обновление от первой установки.
        await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
            if (navigator.serviceWorker.controller) return;
            await new Promise((resolve) => {
                navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true });
            });
        });
        // Первая установка обновлением не считается — сообщать не о чем.
        await expect(page.locator(".update-bar")).toHaveCount(0);

        version = "9.9.9";
        await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r!.update()));

        await expect(page.locator(".update-bar")).toContainText("Вышла новая версия");
        // Новая версия ждёт разрешения: пока её не позвали, кэш прежний.
        expect(await page.evaluate(() => caches.keys())).toContain("umnozhenie-9.9.8");

        // На тренировке полоса накрыла бы клавиатуру — там её быть не должно.
        await page.click('[data-act="drill"]');
        await page.waitForSelector("#question");
        await expect(page.locator(".update-bar")).toHaveCount(0);
        await page.click('[data-act="home"]');
        await expect(page.locator(".update-bar")).toBeVisible();

        await page.click(".update-bar button");

        // Страница перезагрузилась, и заново собрал её уже новый воркер.
        await expect(page.locator('[data-act="drill"]')).toBeVisible();
        await expect(page.locator(".update-bar")).toHaveCount(0);
        expect(await page.evaluate(() => caches.keys())).toEqual(["umnozhenie-9.9.9"]);
    } finally {
        await context.close();
        await new Promise((resolve) => server.close(resolve));
    }
});

test("спринт считает очки и идёт по таймеру", async ({ page }) => {
    await page.click('[data-act="sprint"]');
    await expect(page.locator("#timer")).toBeVisible();

    await type(page, await currentProduct(page));
    await expect(page.locator("#score")).toHaveText("1");
});
