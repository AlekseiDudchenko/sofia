import { test, expect, type Page } from "@playwright/test";

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

test("спринт считает очки и идёт по таймеру", async ({ page }) => {
    await page.click('[data-act="sprint"]');
    await expect(page.locator("#timer")).toBeVisible();

    await type(page, await currentProduct(page));
    await expect(page.locator("#score")).toHaveText("1");
});
