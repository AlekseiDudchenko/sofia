/** Главный экран: дневная норма, две кнопки и карта таблицы. */

import { DECK, MIN_FACTOR, MAX_FACTOR, factFor } from "../facts.js";
import { dayKey, MASTERED_BOX, type CardState } from "../scheduler.js";
import { buildDrillQueue, masteredCount } from "../session.js";
import {
    loadCards, todayStats, streakDays, bestSprint,
    exportAll, importAll, resetAll, DAILY_GOAL,
} from "../store.js";
import { go } from "../router.js";
import { render, onAction, plural } from "./dom.js";
import { minionHTML, type MinionMood } from "./minion.js";
import { SOUND_ACTION, soundToolHTML, toggleSound } from "./sound-toggle.js";

/** Шестеро на 36 фактов: миньон приходит в команду за каждые шесть выученных. */
const CREW_SIZE = 6;

export function showHome(): () => void {
    const today = dayKey(new Date());
    const cards = loadCards();

    const due = buildDrillQueue(cards, today).length;
    const mastered = masteredCount(cards);
    const stats = todayStats(today);
    const streak = streakDays(today);
    const best = bestSprint();

    const goalPct = Math.min(100, Math.round((stats.answers / DAILY_GOAL) * 100));
    const goalDone = stats.answers >= DAILY_GOAL;

    const drillSub = due > 0
        ? `${due} ${plural(due, "пример", "примера", "примеров")} на сегодня`
        : "На сегодня всё — можно повторить";

    const scope = render(`
        <div class="top">
            <h1 class="long">Таблица умножения миньонов для Сони из Томска</h1>
            <span class="streak${streak ? "" : " cold"}">
                ${streak ? "🔥" : "·"} ${streak} ${plural(streak, "день", "дня", "дней")}
            </span>
        </div>

        <div class="daily">
            <div class="daily-row">
                ${minionHTML({ mood: dailyMood(goalPct), eyes: 1 })}
                <div class="daily-text">
                    <div class="daily-head">
                        <span>Сегодня</span>
                        <b>${stats.answers} / ${DAILY_GOAL}</b>
                    </div>
                    <div class="bar${goalDone ? " done" : ""}"><span style="width:${goalPct}%"></span></div>
                    <p class="minion-say">${dailySay(goalPct)}</p>
                </div>
            </div>
        </div>

        <div class="actions">
            <button class="action primary" data-act="drill">
                <span class="action-emoji">🎯</span>
                <span class="action-text">
                    <span class="action-title">Тренировка</span>
                    <span class="action-sub">${drillSub}</span>
                </span>
                ${due > 0 ? `<span class="pill">${due}</span>` : ""}
            </button>
            <button class="action" data-act="sprint">
                <span class="action-emoji">⚡</span>
                <span class="action-text">
                    <span class="action-title">Спринт</span>
                    <span class="action-sub">Минута на скорость</span>
                </span>
                ${best ? `<span class="pill">${best}</span>` : ""}
            </button>
        </div>

        ${crewHTML(mastered)}

        <div class="map">
            <div class="map-head">
                <h2>Карта таблицы</h2>
                <span>${mastered} из ${DECK.length} на автомате</span>
            </div>
            ${gridHTML(cards)}
            <div class="legend">
                <span><i style="background:#22264a"></i>не начато</span>
                <span><i style="background:#4c2a52"></i>учим</span>
                <span><i style="background:#4a3f7a"></i>помню</span>
                <span><i style="background:#2f5d63"></i>почти</span>
                <span><i style="background:#34d399"></i>на автомате</span>
            </div>
        </div>

        <div class="spacer"></div>

        <div class="tools">
            ${soundToolHTML()}
            <button data-act="export">Сохранить копию</button>
            <button data-act="import">Загрузить копию</button>
            <button data-act="reset">Начать заново</button>
        </div>
        <p class="note">
            Весь прогресс хранится только на этом устройстве.<br>
            Интернет нужен один раз — дальше приложение работает офлайн.
        </p>
    `);

    onAction(scope, (action, el) => {
        if (action === "drill") go("/drill");
        else if (action === "sprint") go("/sprint");
        else if (action === "export") downloadBackup(today);
        else if (action === "import") pickBackup();
        else if (action === "reset") confirmReset();
        else if (action === SOUND_ACTION) toggleSound(el);
        else if (action === "cell") revealCell(el);
    });

    return () => {};
}

/** Настроение миньона на главной — это и есть индикатор дневной нормы:
 *  спит, пока не начали, ликует, когда норма закрыта. */
function dailyMood(pct: number): MinionMood {
    if (pct === 0) return "sleepy";
    if (pct >= 100) return "cheer";
    return pct >= 60 ? "happy" : "idle";
}

function dailySay(pct: number): string {
    if (pct === 0) return "Бана-а-ана! Начнём?";
    if (pct >= 100) return "Норма закрыта. Ты сегодня молодец!";
    return pct >= 60 ? "Уже почти — дожимаем!" : "Считаем дальше, я смотрю.";
}

/** Ряд миньонов: заработанные в цвете, остальные — тенями.
 *
 * Карта таблицы показывает, что осталось выучить, и от неё всегда немного
 * грустно. Команда показывает то же самое с другой стороны — сколько уже
 * сделано, — и растёт заметными скачками, а не по одной клетке. */
function crewHTML(mastered: number): string {
    const perMinion = DECK.length / CREW_SIZE;
    const joined = Math.floor(mastered / perMinion);
    const toNext = perMinion - (mastered % perMinion);

    const note = joined >= CREW_SIZE
        ? "Вся команда в сборе"
        : `Ещё ${toNext} ${plural(toNext, "факт", "факта", "фактов")} — и придёт новый`;

    const row = Array.from({ length: CREW_SIZE }, (_, i) => minionHTML({
        size: "sm",
        eyes: i % 3 === 1 ? 1 : 2,
        mood: i < joined ? "happy" : "sleepy",
        extra: i < joined ? "" : "off",
    })).join("");

    return `
        <div class="crew">
            <div class="crew-head">
                <h2>Команда</h2>
                <span>${joined} из ${CREW_SIZE}</span>
            </div>
            <div class="crew-row">${row}</div>
            <p class="minion-say">${note}</p>
        </div>
    `;
}

/** Класс клетки по ступени освоения — этим карта и раскрашивается. */
function cellClass(card: CardState | undefined): string {
    if (!card) return "b-new";
    if (card.box >= MASTERED_BOX) return "b-done";
    if (card.box >= 4) return "b-high";
    if (card.box >= 2) return "b-mid";
    return "b-low";
}

function gridHTML(cards: ReadonlyMap<string, CardState>): string {
    const rows: string[] = [];

    const header = [`<div class="cell corner"></div>`];
    for (let b = MIN_FACTOR; b <= MAX_FACTOR; b++) header.push(`<div class="cell head">${b}</div>`);
    rows.push(header.join(""));

    for (let a = MIN_FACTOR; a <= MAX_FACTOR; a++) {
        const cells = [`<div class="cell head">${a}</div>`];
        for (let b = MIN_FACTOR; b <= MAX_FACTOR; b++) {
            const fact = factFor(a, b)!;
            const card = cards.get(fact.id);
            const done = card && card.box >= MASTERED_BOX;
            // Выученные клетки показывают ответ: таблица буквально заполняется
            // по мере учёбы. Остальные — по тапу, как самопроверка.
            cells.push(
                `<button class="cell ${cellClass(card)}" data-act="cell" data-product="${fact.product}">`
                + `${done ? fact.product : ""}</button>`,
            );
        }
        rows.push(cells.join(""));
    }

    return `<div class="grid">${rows.join("")}</div>`;
}

function revealCell(el: HTMLElement): void {
    if (el.classList.contains("revealed")) return;
    const previous = el.textContent ?? "";
    el.textContent = el.dataset.product ?? "";
    el.classList.add("revealed");
    setTimeout(() => {
        el.classList.remove("revealed");
        el.textContent = previous;
    }, 1800);
}

function downloadBackup(today: string): void {
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `umnozhenie-${today}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function pickBackup(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
            const ok = importAll(JSON.parse(await file.text()));
            alert(ok ? "Прогресс загружен." : "Это не похоже на копию прогресса.");
            if (ok) go("/");
        } catch {
            alert("Не получилось прочитать файл.");
        }
    });
    input.click();
}

function confirmReset(): void {
    if (!confirm("Стереть весь прогресс и начать с нуля?")) return;
    resetAll();
    go("/");
}
