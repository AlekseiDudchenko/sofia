/** Миньоны — маскоты тренажёра.
 *
 * Рисуются кодом на SVG, а не лежат картинками, по той же причине, что и звук
 * синтезируется: файлы пришлось бы тянуть по сети и класть в офлайн-кэш, а
 * растровая картинка ещё и нуждалась бы в трёх размерах. Здесь же один
 * контур масштабируется от 34 до 130 пикселей без потерь и красится теми же
 * переменными, что и остальной интерфейс.
 *
 * Настроение — не украшение: миньон на главной показывает, добита ли дневная
 * норма, а на тренировке отвечает на ответ раньше, чем ребёнок дочитает
 * подсказку. Поэтому набор настроений маленький и каждое что-то значит.
 */

export type MinionMood = "sleepy" | "idle" | "happy" | "cheer" | "oops";

/** Одноглазые и двуглазые встречаются вперемешку — так команда не выглядит
 *  штампованной. Число глаз закрепляется за элементом и при смене настроения
 *  не меняется: миньон, моргнувший вторым глазом, читается как другой. */
export type MinionEyes = 1 | 2;

export interface MinionOptions {
    mood?: MinionMood;
    eyes?: MinionEyes;
    /** Размер: sm — в ряду команды, md — на главной, lg — на итогах,
     *  row — в строю подсказки, где размер считается от размера строя. */
    size?: "sm" | "md" | "lg" | "row";
    /** Класс сверху — например, чтобы притушить незаработанного миньона. */
    extra?: string;
}

/** Счётчик для id внутри SVG: на экране миньонов несколько, а clipPath
 *  адресуется по id — совпадение склеило бы их обрезку. */
let serial = 0;

export function minionHTML(options: MinionOptions = {}): string {
    const mood = options.mood ?? "idle";
    const eyes = options.eyes ?? 2;
    const size = options.size ?? "md";
    const extra = options.extra ? ` ${options.extra}` : "";
    // Моргают вразнобой: синхронное моргание шестерых выглядит механизмом.
    const delay = (serial % 7) * 0.8;

    return `<span class="minion minion-${size} is-${mood}${extra}" data-eyes="${eyes}" data-mood="${mood}"`
        + ` style="--blink-delay:${delay}s">${bodySVG(mood, eyes)}</span>`;
}

/** Меняет настроение уже нарисованного миньона.
 *
 * Разметка пересобирается целиком намеренно: анимации прыжка и досады висят
 * на самом svg, и подмена узла запускает их заново. Каждый новый пример
 * возвращает миньона в «idle», поэтому и два одинаковых ответа подряд дают
 * две реакции, а не одну. Повтор того же настроения при этом ничего не
 * пересобирает — лишняя перерисовка сорвала бы моргание. */
export function setMinionMood(el: HTMLElement, mood: MinionMood): void {
    const eyes: MinionEyes = el.dataset.eyes === "1" ? 1 : 2;
    if (el.dataset.mood === mood) return;

    el.classList.remove(`is-${el.dataset.mood}`);
    el.classList.add(`is-${mood}`);
    el.dataset.mood = mood;
    el.innerHTML = bodySVG(mood, eyes);
}

/** Случайное число глаз — для экранов, где миньон один и каждый заход новый. */
export function randomEyes(random: () => number = Math.random): MinionEyes {
    return random() < 0.5 ? 1 : 2;
}

// ── Контур ────────────────────────────────────────────────────────────────

/* Система координат: 100×136, тело — капсула от y=14 до y=114, очки на
 * y=40, рот около y=64, комбинезон ниже y=74. Всё остальное считается от
 * этих четырёх чисел. */

function bodySVG(mood: MinionMood, eyes: MinionEyes): string {
    const clip = `minion-body-${++serial}`;

    return `<svg viewBox="0 0 100 136" role="img" aria-label="Миньон" focusable="false">
        <defs>
            <clipPath id="${clip}"><rect x="16" y="14" width="68" height="100" rx="34"/></clipPath>
        </defs>

        <g class="m-legs">
            <rect x="36" y="100" width="11" height="24" rx="5.5"/>
            <rect x="53" y="100" width="11" height="24" rx="5.5"/>
            <rect x="26" y="118" width="22" height="13" rx="6.5"/>
            <rect x="52" y="118" width="22" height="13" rx="6.5"/>
        </g>

        <g class="m-arm m-arm-l"><path d="M22 64C12 72 10 82 13 90"/><circle cx="13" cy="93" r="6.5"/></g>
        <g class="m-arm m-arm-r"><path d="M78 64C88 72 90 82 87 90"/><circle cx="87" cy="93" r="6.5"/></g>

        <g class="m-hair">
            <path d="M42 16q-4-7 1-13"/>
            <path d="M50 14v-11"/>
            <path d="M58 16q4-7-1-13"/>
        </g>

        <rect class="m-body" x="16" y="14" width="68" height="100" rx="34"/>

        <g clip-path="url(#${clip})">
            <rect class="m-overalls" x="16" y="86" width="68" height="30"/>
            <rect class="m-pocket" x="41" y="95" width="18" height="14" rx="3"/>
            <path class="m-stitch" d="M45.5 99.5l9 5M54.5 99.5l-9 5"/>
            <rect class="m-strap" x="4" y="33" width="92" height="13"/>
        </g>

        <path class="m-brace" d="M35 76L27 65"/>
        <path class="m-brace" d="M65 76L73 65"/>
        <rect class="m-overalls" x="34" y="74" width="32" height="16" rx="4"/>
        <circle class="m-button" cx="35" cy="76" r="2.8"/>
        <circle class="m-button" cx="65" cy="76" r="2.8"/>

        ${eyesSVG(eyes)}
        ${MOUTHS[mood]}
        ${EXTRAS[mood]}
    </svg>`;
}

function eyesSVG(eyes: MinionEyes): string {
    // Два очка стоят впритык — так они и держатся на голове одной оправой.
    const specs = eyes === 1 ? [{ cx: 50, r: 18 }] : [{ cx: 34, r: 16 }, { cx: 66, r: 16 }];

    return specs.map(({ cx, r }) => {
        const white = r * 0.76;
        const iris = r * 0.36;
        const pupil = r * 0.17;
        return `<g class="m-eye">
            <circle class="m-goggle" cx="${cx}" cy="40" r="${r}"/>
            <circle class="m-white" cx="${cx}" cy="40" r="${white}"/>
            <circle class="m-iris" cx="${cx}" cy="40" r="${iris}"/>
            <circle class="m-pupil" cx="${cx}" cy="40" r="${pupil}"/>
            <circle class="m-shine" cx="${cx - iris * 0.55}" cy="${40 - iris * 0.7}" r="${pupil * 0.75}"/>
            <circle class="m-lid" cx="${cx}" cy="40" r="${white}"
                style="transform-origin:${cx}px ${40 - white}px"/>
        </g>`;
    }).join("");
}

/** Четырёхлучевая искра — блёстки вокруг ликующего миньона. */
function sparkle(cx: number, cy: number, size: number): string {
    const q = size * 0.24;
    return `<path class="m-spark" d="M${cx} ${cy - size}`
        + `Q${cx + q} ${cy - q} ${cx + size} ${cy}Q${cx + q} ${cy + q} ${cx} ${cy + size}`
        + `Q${cx - q} ${cy + q} ${cx - size} ${cy}Q${cx - q} ${cy - q} ${cx} ${cy - size}z"/>`;
}

const MOUTHS: Record<MinionMood, string> = {
    sleepy: `<path class="m-mouth" d="M44 64h12"/>`,
    idle: `<path class="m-mouth" d="M41 62q9 8 18 0"/>`,
    happy: `<path class="m-mouth-fill" d="M37 60a13 9 0 0 1 26 0z"/>`,
    cheer: `<ellipse class="m-mouth-fill" cx="50" cy="63" rx="12" ry="10"/>`
        + `<ellipse class="m-tongue" cx="50" cy="68" rx="5" ry="3"/>`,
    oops: `<path class="m-mouth" d="M39 66q5.5-7 11 0t11 0"/>`,
};

const EXTRAS: Record<MinionMood, string> = {
    sleepy: `<text class="m-zzz" x="80" y="22">z</text><text class="m-zzz m-zzz-2" x="88" y="10">z</text>`,
    idle: "",
    happy: "",
    cheer: sparkle(12, 26, 7) + sparkle(90, 20, 5.5) + sparkle(84, 46, 4),
    oops: "",
};
