import { defineConfig, devices } from "@playwright/test";

/* CHROMIUM_PATH позволяет прогнать тесты на уже установленном в системе
 * браузере, не выкачивая сборку под конкретную версию Playwright. */
const executablePath = process.env.CHROMIUM_PATH;

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? "list" : "line",
    use: {
        baseURL: "http://localhost:5173",
        trace: "on-first-retry",
    },
    projects: [
        {
            name: "mobile",
            use: {
                ...devices["Pixel 7"],
                ...(executablePath ? { launchOptions: { executablePath } } : {}),
            },
        },
    ],
    webServer: {
        command: "npm start",
        url: "http://localhost:5173",
        reuseExistingServer: !process.env.CI,
        timeout: 30_000,
    },
});
