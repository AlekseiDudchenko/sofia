/** Спринт: минута на как можно больше правильных ответов.
 *
 * Ответы здесь НЕ двигают лестницу повторений — только дневную статистику.
 * Иначе десяток быстрых ответов подряд под адреналином объявил бы факт
 * выученным, хотя проверялась реакция, а не память. Игра — это награда и
 * разминка, расписание делает тренировка.
 */

import { orientation, type Fact } from "../facts.js";
import { checkInput } from "../answer.js";
import { dayKey } from "../scheduler.js";
import { sprintPool, pickSprintFact } from "../session.js";
import { loadCards, recordAnswer, bestSprint, submitSprint } from "../store.js";
import { go } from "../router.js";
import { render, qs, onAction, plural } from "./dom.js";
import { keypadHTML, bindKeypad } from "./keypad.js";

const ROUND_MS = 60_000;
const CORRECT_PAUSE_MS = 220;
const WRONG_PAUSE_MS = 1100;

export function showSprint(): () => void {
    const today = dayKey(new Date());
    const cards = loadCards();
    const pool = sprintPool(cards);

    let current: Fact | null = null;
    let flip = false;
    let typed = "";
    let locked = true;
    let score = 0;
    let attempts = 0;
    let finished = false;

    const startedAt = performance.now();
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    const scope = render(`
        <div class="play">
            <div class="play-bar">
                <button class="icon-btn" data-act="home" aria-label="Выйти">✕</button>
                <div class="bar"><span id="progress" style="width:100%"></span></div>
                <div class="timer" id="timer">60</div>
                <div class="pill score-pill">⚡&nbsp;<b id="score">0</b></div>
            </div>
            <div class="stage">
                <div class="question" id="question"></div>
                <div class="slot" id="slot"></div>
                <div class="hint" id="hint"></div>
            </div>
            ${keypadHTML()}
        </div>
    `);

    const questionEl = qs("#question", scope);
    const slotEl = qs("#slot", scope);
    const hintEl = qs("#hint", scope);
    const timerEl = qs("#timer", scope);
    const progressEl = qs("#progress", scope);
    const scoreEl = qs("#score", scope);

    onAction(scope, (action) => { if (action === "home") go("/"); });
    const unbind = bindKeypad(scope, { onDigit, onErase });

    const ticker = window.setInterval(tick, 100);

    function tick(): void {
        const left = Math.max(0, ROUND_MS - (performance.now() - startedAt));
        timerEl.textContent = String(Math.ceil(left / 1000));
        timerEl.classList.toggle("low", left <= 10_000);
        progressEl.style.width = `${(left / ROUND_MS) * 100}%`;
        if (left === 0) finish();
    }

    function paintSlot(state: "" | "correct" | "wrong"): void {
        slotEl.className = `slot${state ? ` ${state}` : ""}`;
        slotEl.innerHTML = typed === "" ? `<span class="caret">?</span>` : typed;
    }

    function next(): void {
        if (finished) return;
        current = pickSprintFact(pool, cards, Math.random, current?.id);
        flip = Math.random() < 0.5;
        typed = "";
        locked = false;

        const { left, right } = orientation(current, flip);
        questionEl.textContent = `${left} × ${right}`;
        hintEl.textContent = "";
        hintEl.className = "hint";
        paintSlot("");
    }

    function onDigit(digit: string): void {
        if (locked || !current) return;
        typed += digit;

        const verdict = checkInput(typed, current.product);
        if (verdict === "pending") { paintSlot(""); return; }

        locked = true;
        attempts++;
        recordAnswer(today, verdict === "correct");

        if (verdict === "correct") {
            score++;
            scoreEl.textContent = String(score);
            paintSlot("correct");
            later(next, CORRECT_PAUSE_MS);
        } else {
            const { left, right } = orientation(current, flip);
            paintSlot("wrong");
            hintEl.className = "hint bad";
            hintEl.textContent = `${left} × ${right} = ${current.product}`;
            later(next, WRONG_PAUSE_MS);
        }
    }

    function onErase(): void {
        if (locked || typed === "") return;
        typed = typed.slice(0, -1);
        paintSlot("");
    }

    function finish(): void {
        if (finished) return;
        finished = true;
        stop();
        showSprintSummary(score, attempts, submitSprint(score));
    }

    function stop(): void {
        unbind();
        clearInterval(ticker);
        for (const id of timers) clearTimeout(id);
    }

    next();
    return stop;
}

function showSprintSummary(score: number, attempts: number, isRecord: boolean): void {
    const best = bestSprint();
    const accuracy = attempts ? Math.round((score / attempts) * 100) : 0;

    const scope = render(`
        <div class="top"><h1>Минута вышла</h1></div>
        <div class="result">
            <div class="big">${score}</div>
            <p class="action-sub">${plural(score, "правильный ответ", "правильных ответа", "правильных ответов")}</p>
            ${isRecord ? `<p class="record">Новый рекорд!</p>` : ""}
        </div>
        <div class="stats">
            <div class="stat"><b>${best}</b><span>рекорд</span></div>
            <div class="stat"><b>${accuracy}%</b><span>точность</span></div>
            <div class="stat"><b>${attempts}</b><span>примеров</span></div>
        </div>
        <div class="spacer"></div>
        <div class="stack">
            <button class="btn primary" data-act="again">Ещё раз</button>
            <button class="btn" data-act="home">На главную</button>
        </div>
    `);

    onAction(scope, (action) => go(action === "again" ? "/sprint" : "/"));
}
