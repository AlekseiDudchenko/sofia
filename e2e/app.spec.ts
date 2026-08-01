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

test("спринт считает очки и идёт по таймеру", async ({ page }) => {
    await page.click('[data-act="sprint"]');
    await expect(page.locator("#timer")).toBeVisible();

    await type(page, await currentProduct(page));
    await expect(page.locator("#score")).toHaveText("1");
});
