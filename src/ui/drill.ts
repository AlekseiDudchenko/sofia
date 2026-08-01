/** Дневная тренировка: очередь из просроченных повторений и новых фактов. */

import { orientation, type Fact } from "../facts.js";
import { checkInput } from "../answer.js";
import { grade } from "../rating.js";
import { applyOutcome, dayKey } from "../scheduler.js";
import { buildDrillQueue, requeue } from "../session.js";
import { loadCards, saveCards, getOrCreate, recordAnswer } from "../store.js";
import { go } from "../router.js";
import { play } from "../sound.js";
import { render, qs, onAction, formatSeconds, plural } from "./dom.js";
import { minionHTML, setMinionMood, randomEyes, type MinionMood } from "./minion.js";
import { hasArray, arrayHTML, setArrayMood } from "./array.js";
import { keypadHTML, bindKeypad } from "./keypad.js";
import { SOUND_ACTION, soundIconHTML, toggleSound } from "./sound-toggle.js";

const CORRECT_PAUSE_MS = 450;
/** После ошибки пауза длиннее: нужно время прочитать правильный ответ. */
const WRONG_PAUSE_MS = 1600;

export function showDrill(): () => void {
    const today = dayKey(new Date());
    const cards = loadCards();
    const queue = buildDrillQueue(cards, today);

    if (queue.length === 0) return showAllDone();

    let remaining = queue;
    let current: Fact | null = null;
    let flip = false;
    let typed = "";
    let shownAt = 0;
    let firstKeyAt = 0;
    let locked = true;
    /** Открыта ли подсказка на текущем примере — от этого зависит оценка. */
    let hinted = false;

    let answered = 0;
    let correct = 0;
    const latencies: number[] = [];
    const missed = new Set<string>();

    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    const scope = render(`
        <div class="play">
            <div class="play-bar">
                <button class="icon-btn" data-act="home" aria-label="На главную">✕</button>
                <div class="bar"><span id="progress" style="width:0%"></span></div>
                ${soundIconHTML()}
                <div class="score" id="left"></div>
            </div>
            <div class="stage">
                ${minionHTML({ eyes: randomEyes(), size: "md" })}
                <div class="question" id="question"></div>
                <div class="array" id="array"></div>
                <div class="slot" id="slot"></div>
                <div class="hint" id="hint"></div>
                <button class="hint-btn" id="hint-btn" data-act="hint" hidden>Подсказка</button>
            </div>
            ${keypadHTML()}
        </div>
    `);

    const stageEl = qs(".stage", scope);
    const minionEl = qs(".minion", scope);
    const questionEl = qs("#question", scope);
    const arrayEl = qs("#array", scope);
    const hintBtn = qs("#hint-btn", scope);
    const slotEl = qs("#slot", scope);
    const hintEl = qs("#hint", scope);
    const progressEl = qs("#progress", scope);
    const leftEl = qs("#left", scope);

    onAction(scope, (action, el) => {
        if (action === "home") go("/");
        else if (action === "hint") showArray();
        else if (action === SOUND_ACTION) toggleSound(el);
    });
    const unbind = bindKeypad(scope, { onDigit, onErase });

    function paintSlot(state: "" | "correct" | "wrong"): void {
        slotEl.className = `slot${state ? ` ${state}` : ""}`;
        slotEl.innerHTML = typed === "" ? `<span class="caret">?</span>` : typed;
    }

    function next(): void {
        if (remaining.length === 0) return finish();

        current = remaining[0]!;
        remaining = remaining.slice(1);
        flip = Math.random() < 0.5;
        typed = "";
        firstKeyAt = 0;
        locked = false;

        const { left, right } = orientation(current, flip);
        questionEl.textContent = `${left} × ${right}`;
        hintEl.textContent = "";
        hintEl.className = "hint";
        paintSlot("");
        setMinionMood(minionEl, "idle");

        // Подсказку каждый пример просят заново: она помогает, пока факт
        // новый, и мешает, как только он начал вспоминаться сам.
        hinted = false;
        arrayEl.innerHTML = "";
        stageEl.classList.remove("with-array");
        minionEl.hidden = false;
        hintBtn.hidden = !hasArray(left, right);

        const total = answered + remaining.length + 1;
        progressEl.style.width = `${Math.round((answered / total) * 100)}%`;
        leftEl.textContent = String(remaining.length + 1);

        // Отсчёт начинается после отрисовки, иначе в замер попадёт время кадра.
        requestAnimationFrame(() => { shownAt = performance.now(); });
    }

    function onDigit(digit: string): void {
        if (locked || !current) return;
        // Отметка времени снимается до звука: планирование сигнала занимает
        // доли миллисекунды, но замер припоминания не должно трогать ничто.
        if (typed === "") firstKeyAt = performance.now();
        typed += digit;

        const verdict = checkInput(typed, current.product);
        // Щелчок звучит только у цифры, которая ничего не решила: на последней
        // сразу идёт вердикт, и складывать их в один момент незачем.
        if (verdict === "pending") { play("key"); paintSlot(""); return; }
        resolve(verdict === "correct");
    }

    /** Подсказка: маскот уступает место строю миньонов. Вдвоём им тесно —
     *  строй занимает ровно то место, где стоял миньон-маскот. */
    function showArray(): void {
        if (locked || hinted || !current) return;
        const { left, right } = orientation(current, flip);

        hinted = true;
        arrayEl.innerHTML = arrayHTML(left, right);
        // Число рядов уходит в CSS: от него зависит, сколько высоты строй
        // вправе занять, — два ряда не должны раздуваться на весь экран.
        arrayEl.style.setProperty("--rows", String(left));
        // Классом экран отдаёт строю ещё немного высоты: пример и поле ответа
        // ужимаются, потому что считать по картинке сейчас важнее.
        stageEl.classList.add("with-array");
        minionEl.hidden = true;
        hintBtn.hidden = true;
    }

    /** Реакция на ответ: маскот, а при открытой подсказке — весь строй. */
    function react(mood: MinionMood): void {
        setMinionMood(minionEl, mood);
        if (hinted) setArrayMood(arrayEl, mood);
    }

    function onErase(): void {
        if (locked || typed === "") return;
        play("erase");
        typed = typed.slice(0, -1);
        paintSlot("");
    }

    function resolve(isCorrect: boolean): void {
        if (!current) return;
        locked = true;
        hintBtn.hidden = true;

        const latency = Math.max(0, firstKeyAt - shownAt);
        const graded = grade(isCorrect, latency);
        // Со строем на экране ответ можно пересчитать, а не вспомнить, поэтому
        // ступень он не двигает ни вверх, ни вниз — ровно как ответ после
        // долгой паузы. Наказывать за просьбу о помощи нельзя: иначе кнопка
        // подсказки становится ловушкой и её перестают нажимать. Ошибка при
        // этом остаётся ошибкой и сбрасывает факт, как обычно.
        const result = hinted && isCorrect
            ? { ...graded, speed: "ok" as const, timingTrusted: false }
            : graded;
        const card = getOrCreate(cards, current.id, today);
        cards.set(current.id, applyOutcome(card, { ...result, latencyMs: latency }, today));
        saveCards(cards);
        recordAnswer(today, isCorrect);

        answered++;
        if (isCorrect) {
            correct++;
            if (result.timingTrusted) latencies.push(latency);
            play(result.speed === "fast" ? "fast" : "correct");
            paintSlot("correct");
            // Быстрый ответ миньон празднует прыжком, обычный — просто улыбкой:
            // иначе разницы между «вспомнила» и «досчитала» не видно.
            react(result.speed === "fast" ? "cheer" : "happy");
            slotEl.classList.add("pop");
            hintEl.textContent = result.speed === "fast" ? "Быстро!" : "";
            later(next, CORRECT_PAUSE_MS);
        } else {
            missed.add(current.id);
            play("wrong");
            const { left, right } = orientation(current, flip);
            paintSlot("wrong");
            react("oops");
            hintEl.className = "hint bad";
            hintEl.textContent = `${left} × ${right} = ${current.product}`;
            remaining = requeue(remaining, current);
            later(next, WRONG_PAUSE_MS);
        }
    }

    function finish(): void {
        unbind();
        play("finish");
        showDrillSummary({ answered, correct, latencies, missed: [...missed] });
    }

    next();

    return () => {
        unbind();
        for (const id of timers) clearTimeout(id);
    };
}

interface DrillResult {
    answered: number;
    correct: number;
    latencies: number[];
    missed: string[];
}

function showDrillSummary(result: DrillResult): void {
    const accuracy = result.answered ? Math.round((result.correct / result.answered) * 100) : 0;
    const average = result.latencies.length
        ? result.latencies.reduce((s, v) => s + v, 0) / result.latencies.length
        : 0;

    const toughList = result.missed
        .map((id) => {
            const [a, b] = id.split("x").map(Number);
            return `<li>${a} × ${b} = ${a! * b!}</li>`;
        })
        .join("");

    const tough = toughList
        ? `<div class="tough"><h3>Сегодня не пошли — вернутся завтра</h3><ul>${toughList}</ul></div>`
        : `<div class="tough"><h3>Ни одной ошибки. Так держать!</h3></div>`;

    // Настроение итогов — по ошибкам, а не по точности: для ребёнка «ни одной»
    // и «одна» — разные новости, а 92% против 87% не значат ничего.
    const mood = result.missed.length === 0 ? "cheer" : result.missed.length <= 2 ? "happy" : "idle";

    const scope = render(`
        <div class="top"><h1>Готово</h1></div>
        <div class="result">
            ${minionHTML({ mood, eyes: randomEyes(), size: "lg" })}
            <div class="big">${result.correct} / ${result.answered}</div>
            <p class="action-sub">${plural(result.answered, "ответ", "ответа", "ответов")} за подход</p>
        </div>
        <div class="stats">
            <div class="stat"><b>${accuracy}%</b><span>точность</span></div>
            <div class="stat"><b>${average ? formatSeconds(average) : "—"}</b><span>сек. в среднем</span></div>
            <div class="stat"><b>${result.missed.length}</b><span>${plural(result.missed.length, "ошибка", "ошибки", "ошибок")}</span></div>
        </div>
        ${tough}
        <div class="spacer"></div>
        <div class="stack">
            <button class="btn primary" data-act="again">Ещё подход</button>
            <button class="btn" data-act="home">На главную</button>
        </div>
    `);

    onAction(scope, (action) => go(action === "again" ? "/drill" : "/"));
}

function showAllDone(): () => void {
    const scope = render(`
        <div class="top"><h1>На сегодня всё</h1></div>
        <div class="result">
            ${minionHTML({ mood: "sleepy", eyes: randomEyes(), size: "lg" })}
            <div class="big">✓</div>
            <p class="action-sub">Все повторения закрыты. Новые факты откроются завтра — так они лучше запомнятся.</p>
        </div>
        <div class="spacer"></div>
        <div class="stack">
            <button class="btn primary" data-act="sprint">Сыграть в спринт</button>
            <button class="btn" data-act="home">На главную</button>
        </div>
    `);

    onAction(scope, (action) => go(action === "sprint" ? "/sprint" : "/"));
    return () => {};
}
