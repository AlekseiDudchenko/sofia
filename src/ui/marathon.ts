/** Марафон: примеры идут без конца, пока не кончатся три жизни.
 *
 * Игра, противоположная спринту. Там торопят секунды и ошибка стоит только
 * очка; здесь думать можно сколько угодно, но каждая ошибка стоит сердечка.
 * Ребёнку, который под таймером срывается и начинает угадывать, нужна ровно
 * такая вторая игра — где выигрывает не скорость, а аккуратность.
 *
 * Как и спринт, марафон НЕ двигает лестницу повторений: расписание делает
 * тренировка, а игра даёт очки, рекорд и дневную норму. Иначе длинная удачная
 * серия объявила бы выученным десяток фактов за один вечер.
 */

import { orientation, type Fact } from "../facts.js";
import { checkInput } from "../answer.js";
import { dayKey } from "../scheduler.js";
import {
    sprintPool, pickSprintFact, tickRetries,
    MARATHON_LIVES, MARATHON_RETRY_GAP, type Retry,
} from "../session.js";
import { loadCards, recordAnswer, bestMarathon, submitMarathon } from "../store.js";
import { go } from "../router.js";
import { play } from "../sound.js";
import { render, qs, onAction, plural } from "./dom.js";
import { minionHTML, setMinionMood, randomEyes } from "./minion.js";
import { keypadHTML, bindKeypad } from "./keypad.js";
import { SOUND_ACTION, soundIconHTML, toggleSound } from "./sound-toggle.js";

const CORRECT_PAUSE_MS = 380;
/** После ошибки пауза длиннее: нужно время прочитать правильный ответ. */
const WRONG_PAUSE_MS = 1700;
/** Каждый десятый ответ отмечается отдельно: бесконечной игре нужны вехи,
 *  иначе счётчик растёт, а ощущения продвижения нет. */
const MILESTONE = 10;

export function showMarathon(): () => void {
    const today = dayKey(new Date());
    const cards = loadCards();
    const pool = sprintPool(cards);

    let current: Fact | null = null;
    let flip = false;
    let typed = "";
    let locked = true;
    let score = 0;
    let lives = MARATHON_LIVES;
    let finished = false;
    /** Факты, стоившие жизни: возвращаются в игру и попадают в итоги. */
    let retries: Retry[] = [];
    const missed: string[] = [];

    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    const scope = render(`
        <div class="play">
            <div class="play-bar">
                <button class="icon-btn" data-act="home" aria-label="Выйти">✕</button>
                <div class="hearts" id="hearts" aria-label="Жизни">${heartsHTML(lives)}</div>
                ${soundIconHTML()}
                <div class="pill score-pill">⭐&nbsp;<b id="score">0</b></div>
            </div>
            <div class="stage">
                ${minionHTML({ eyes: randomEyes(), size: "md" })}
                <div class="question" id="question"></div>
                <div class="slot" id="slot"></div>
                <div class="hint" id="hint"></div>
            </div>
            ${keypadHTML()}
        </div>
    `);

    const minionEl = qs(".minion", scope);
    const questionEl = qs("#question", scope);
    const slotEl = qs("#slot", scope);
    const hintEl = qs("#hint", scope);
    const heartsEl = qs("#hearts", scope);
    const scoreEl = qs("#score", scope);

    onAction(scope, (action, el) => {
        if (action === "home") go("/");
        else if (action === SOUND_ACTION) toggleSound(el);
    });
    const unbind = bindKeypad(scope, { onDigit, onErase });

    function paintSlot(state: "" | "correct" | "wrong"): void {
        slotEl.className = `slot${state ? ` ${state}` : ""}`;
        slotEl.innerHTML = typed === "" ? `<span class="caret">?</span>` : typed;
    }

    function next(): void {
        if (finished) return;

        // Сначала — созревший переспрос: факт, который только что стоил жизни,
        // важнее случайного следующего.
        const { due, rest } = tickRetries(retries);
        retries = rest;
        current = due ?? pickSprintFact(pool, cards, Math.random, current?.id);

        flip = Math.random() < 0.5;
        typed = "";
        locked = false;

        const { left, right } = orientation(current, flip);
        questionEl.textContent = `${left} × ${right}`;
        hintEl.textContent = "";
        hintEl.className = "hint";
        paintSlot("");
        setMinionMood(minionEl, "idle");
    }

    function onDigit(digit: string): void {
        if (locked || !current) return;
        typed += digit;

        const verdict = checkInput(typed, current.product);
        if (verdict === "pending") { play("key"); paintSlot(""); return; }

        locked = true;
        recordAnswer(today, verdict === "correct");

        if (verdict === "correct") hit();
        else miss();
    }

    function onErase(): void {
        if (locked || typed === "") return;
        play("erase");
        typed = typed.slice(0, -1);
        paintSlot("");
    }

    function hit(): void {
        score++;
        scoreEl.textContent = String(score);
        paintSlot("correct");
        slotEl.classList.add("pop");

        const milestone = score % MILESTONE === 0;
        play(milestone ? "fast" : "correct");
        setMinionMood(minionEl, milestone ? "cheer" : "happy");
        if (milestone) hintEl.textContent = `Серия ${score}!`;

        later(next, CORRECT_PAUSE_MS);
    }

    function miss(): void {
        if (!current) return;
        lives--;
        missed.push(current.id);
        retries = [...retries, { fact: current, after: MARATHON_RETRY_GAP }];

        // Погасшее сердце отмечается вспышкой: на экране примера тихую смену
        // цвета в углу панели просто не заметить.
        heartsEl.innerHTML = heartsHTML(lives, true);

        const { left, right } = orientation(current, flip);
        paintSlot("wrong");
        setMinionMood(minionEl, "oops");
        hintEl.className = "hint bad";
        hintEl.textContent = `${left} × ${right} = ${current.product}`;

        if (lives <= 0) {
            // Правильный ответ на экране, звук проигрыша — сразу; экран итогов
            // приходит с той же паузой, что и обычный следующий пример.
            play("gameover");
            later(gameOver, WRONG_PAUSE_MS);
            return;
        }

        play("wrong");
        later(next, WRONG_PAUSE_MS);
    }

    function gameOver(): void {
        if (finished) return;
        finished = true;
        stop();

        const isRecord = submitMarathon(score);
        if (isRecord) play("record");
        showMarathonSummary(score, missed, isRecord);
    }

    function stop(): void {
        unbind();
        for (const id of timers) clearTimeout(id);
    }

    next();
    return stop;
}

/** Ряд сердец. `justLost` подсвечивает то, которое погасло только что. */
function heartsHTML(lives: number, justLost = false): string {
    return Array.from({ length: MARATHON_LIVES }, (_, i) => {
        const alive = i < lives;
        const just = !alive && justLost && i === lives;
        return `<span class="heart${alive ? "" : " lost"}${just ? " just" : ""}">❤</span>`;
    }).join("");
}

function showMarathonSummary(score: number, missed: string[], isRecord: boolean): void {
    const best = bestMarathon();
    const attempts = score + missed.length;
    const accuracy = attempts ? Math.round((score / attempts) * 100) : 0;

    const toughList = missed
        .map((id) => {
            const [a, b] = id.split("x").map(Number);
            return `<li>${a} × ${b} = ${a! * b!}</li>`;
        })
        .join("");

    // Три примера, отнявшие жизни, — самая полезная часть итогов: это ровно
    // то, что стоит посмотреть перед следующим заходом.
    const tough = toughList
        ? `<div class="tough"><h3>Вот на чём сгорели жизни</h3><ul>${toughList}</ul></div>`
        : "";

    const scope = render(`
        <div class="top"><h1>Жизни кончились</h1></div>
        <div class="result">
            ${minionHTML({ mood: isRecord ? "cheer" : score >= MILESTONE ? "happy" : "oops", eyes: randomEyes(), size: "lg" })}
            <div class="big">${score}</div>
            <p class="action-sub">${plural(score, "правильный ответ", "правильных ответа", "правильных ответов")}</p>
            ${isRecord ? `<p class="record">Новый рекорд!</p>` : ""}
        </div>
        <div class="stats">
            <div class="stat"><b>${best}</b><span>рекорд</span></div>
            <div class="stat"><b>${accuracy}%</b><span>точность</span></div>
            <div class="stat"><b>${attempts}</b><span>примеров</span></div>
        </div>
        ${tough}
        <div class="spacer"></div>
        <div class="stack">
            <button class="btn primary" data-act="again">Ещё раз</button>
            <button class="btn" data-act="home">На главную</button>
        </div>
    `);

    onAction(scope, (action) => go(action === "again" ? "/marathon" : "/"));
}
