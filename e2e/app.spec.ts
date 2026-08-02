import { test, expect, type Page } from "@playwright/test";
import { spawn } from "node:child_process";
import { connect } from "node:net";
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

test("на главной видны все три режима и пустая карта", async ({ page }) => {
    await expect(page.locator('[data-act="drill"]')).toContainText("Тренировка");
    await expect(page.locator('[data-act="sprint"]')).toContainText("Спринт");
    await expect(page.locator('[data-act="marathon"]')).toContainText("Марафон");
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

test("спринт считает очки и идёт по таймеру", async ({ page }) => {
    await page.click('[data-act="sprint"]');
    await expect(page.locator("#timer")).toBeVisible();

    await type(page, await currentProduct(page));
    await expect(page.locator("#score")).toHaveText("1");
});

/* Марафон: без таймера, но с тремя жизнями. Проверяем то, ради чего он и
 * сделан, — что ошибка стоит сердечка, а третья заканчивает игру. */
test("марафон отнимает жизнь за ошибку и кончается на третьей", async ({ page }) => {
    /** Цифра, которая для этого ответа заведомо неверна и не является началом. */
    const wrongFor = (product: number) => (String(product)[0] === "9" ? "1" : "9");

    await page.click('[data-act="marathon"]');
    await expect(page.locator(".heart")).toHaveCount(3);
    await expect(page.locator(".heart.lost")).toHaveCount(0);

    // Верный ответ поднимает счёт и жизней не трогает.
    await type(page, await currentProduct(page));
    await expect(page.locator("#score")).toHaveText("1");
    await expect(page.locator(".heart.lost")).toHaveCount(0);
    await page.waitForTimeout(500);

    for (let life = 1; life <= 3; life++) {
        await type(page, wrongFor(await currentProduct(page)));
        if (life === 3) break;
        await expect(page.locator(".heart.lost")).toHaveCount(life);
        await page.waitForTimeout(1900);
    }

    // Третья ошибка выносит на итоги, и там ровно один правильный ответ.
    await expect(page.locator(".result .big")).toHaveText("1");
    await expect(page.locator(".tough li")).toHaveCount(3);
});

test("рекорд марафона переживает выход на главную", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("sofia.marathon.v1", '{"best":7}'));
    await page.reload();
    await expect(page.locator('[data-act="marathon"] .pill')).toHaveText("7");
});

/* Подсказка миньонами: пример 2 × 4 раскладывается в два ряда по четыре.
 * Строй рисуется не всегда — только пока пример считают, а не вспоминают, —
 * поэтому сначала ищем пример, у которого кнопка вообще есть. */
test.describe("подсказка миньонами", () => {
    /** Прокликивает примеры, пока не попадётся тот, у которого есть подсказка. */
    async function untilHinted(page: Page): Promise<{ left: number; right: number }> {
        await page.waitForSelector("#question");
        for (let i = 0; i < 12; i++) {
            const [left, right] = (await page.locator("#question").textContent())!
                .split("×").map((part) => Number(part.trim()));
            if (await page.locator('[data-act="hint"]').isVisible()) {
                return { left: left!, right: right! };
            }
            await type(page, left! * right!);
            await page.waitForTimeout(550);
        }
        throw new Error("пример с подсказкой так и не встретился");
    }

    test("раскладывает пример рядами и уступает место маскоту обратно", async ({ page }) => {
        await page.click('[data-act="drill"]');
        const { left, right } = await untilHinted(page);

        await expect(page.locator(".arow")).toHaveCount(0);
        await page.click('[data-act="hint"]');

        // Первое число — ряды, но строй длиннее пяти рядов кладётся на бок:
        // 9 × 2 показывается тем же строем, что и 2 × 9 (см. arrayShape).
        const rows = left <= 5 ? left : right;
        const cols = left <= 5 ? right : left;

        await expect(page.locator(".arow")).toHaveCount(rows);
        await expect(page.locator(".arow").first().locator(".minion")).toHaveCount(cols);
        await expect(page.locator("#array .minion")).toHaveCount(left * right);
        // Маскот уходит: вдвоём со строем им тесно.
        await expect(page.locator(".stage > .minion")).toBeHidden();
        await expect(page.locator('[data-act="hint"]')).toBeHidden();

        // Следующий пример начинается с чистого экрана — подсказку просят заново.
        await type(page, left * right);
        await page.waitForTimeout(650);
        await expect(page.locator(".arow")).toHaveCount(0);
        await expect(page.locator(".stage > .minion")).toBeVisible();
    });

    test("ответ со строем на экране не поднимает ступень факта", async ({ page }) => {
        await page.click('[data-act="drill"]');
        const { left, right } = await untilHinted(page);
        const id = left <= right ? `${left}x${right}` : `${right}x${left}`;

        await page.click('[data-act="hint"]');
        await type(page, left * right);
        await expect(page.locator(".slot")).toHaveClass(/correct/);

        // Ступень растёт только от быстрого ответа без подсказки: пересчитать
        // миньонов — не то же самое, что вспомнить.
        const box = await page.evaluate((cardId) => {
            const cards = JSON.parse(localStorage.getItem("sofia.cards.v1") ?? "[]");
            return cards.find((c: { id: string }) => c.id === cardId)?.box;
        }, id);
        expect(box).toBe(0);
    });
});

/* Строй занимает место маскота, а не место клавиатуры: на низком экране это
 * разница между «можно ответить» и «кнопки за краем». */
for (const viewport of [
    { name: "низкий экран", width: 320, height: 568 },
    { name: "альбомная ориентация", width: 740, height: 360 },
]) {
    test(`строй подсказки не выдавливает клавиатуру: ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.click('[data-act="drill"]');
        await page.waitForSelector("#question");

        // Самый высокий строй из возможных — пять рядов по пять.
        await page.evaluate(async () => {
            const { arrayHTML } = await import("/js/ui/array.js");
            const array = document.querySelector("#array")!;
            array.innerHTML = arrayHTML(5, 5);
            (array as HTMLElement).style.setProperty("--rows", "5");
            document.querySelector(".stage")!.classList.add("with-array");
            (document.querySelector(".stage > .minion") as HTMLElement).hidden = true;
        });

        const box = (await page.locator(".keypad").boundingBox())!;
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        const overflow = await page.evaluate(() => ({
            y: document.documentElement.scrollHeight - window.innerHeight,
            x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }));
        expect(overflow.y).toBeLessThanOrEqual(0);
        expect(overflow.x).toBeLessThanOrEqual(0);
    });
}
