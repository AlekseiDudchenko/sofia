/** Звук — синтезом, а не файлами.
 *
 * Ни одного mp3: Web Audio выдаёт нужные щелчки и трезвучия из пары
 * осцилляторов, а приложение остаётся набором текстовых файлов, которые
 * целиком уходят в офлайн-кэш. Файлы пришлось бы класть в `SHELL`
 * сервис-воркера, тащить по сети и держать в репозитории — ради сигналов
 * длиной в десятую долю секунды это несоразмерно.
 *
 * Тон подобран мягкий намеренно. Ошибка звучит тише и ниже правильного
 * ответа, а не резче: неверный ответ здесь — обычная часть тренировки,
 * пугать за него нечем.
 */

import { soundEnabled } from "./store.js";

export type Cue =
    | "key"      // нажата цифра
    | "erase"    // стёрта цифра
    | "correct"  // верный ответ
    | "fast"     // верный ответ быстрее двух секунд
    | "wrong"    // ошибка
    | "finish"   // тренировка закончена
    | "record"   // новый рекорд спринта
    | "tick"     // последние секунды спринта
    | "timeup";  // минута вышла

interface Note {
    /** Частота, Гц. */
    freq: number;
    /** Сдвиг от начала сигнала, мс. */
    at?: number;
    /** Длительность, мс. */
    dur?: number;
    type?: OscillatorType;
    /** Громкость ноты, 0..1, до общего регулятора. */
    gain?: number;
    /** Скольжение частоты к этому значению к концу ноты. */
    glide?: number;
}

/** Общий потолок громкости: сигналы звучат в комнате, а не в наушниках,
 *  и не должны перебивать голос рядом. */
const MASTER_GAIN = 0.22;
/** Атака и спад огибающей, с. Без них обрыв синуса щёлкает громче ноты. */
const ATTACK_S = 0.006;
const DEFAULT_DUR_MS = 120;

const CUES: Record<Cue, readonly Note[]> = {
    // Клавиша звучит часто, поэтому тише всего и совсем коротко.
    key: [{ freq: 660, dur: 30, type: "triangle", gain: 0.18 }],
    erase: [{ freq: 320, dur: 45, type: "triangle", gain: 0.16 }],
    // Верно — восходящая кварта: короткое «ага».
    correct: [
        { freq: 784, dur: 80, gain: 0.35 },
        { freq: 1046, at: 70, dur: 150, gain: 0.32 },
    ],
    // Быстро — то же, но трезвучием вверх: заметно радостнее обычного «верно».
    fast: [
        { freq: 784, dur: 70, gain: 0.32 },
        { freq: 1046, at: 65, dur: 70, gain: 0.32 },
        { freq: 1318, at: 130, dur: 200, gain: 0.34 },
    ],
    // Ошибка — мягкое соскальзывание вниз, без резких обертонов.
    wrong: [{ freq: 300, glide: 190, dur: 260, type: "triangle", gain: 0.3 }],
    // Конец тренировки — до-ми-соль-до.
    finish: [
        { freq: 523, dur: 110, gain: 0.3 },
        { freq: 659, at: 105, dur: 110, gain: 0.3 },
        { freq: 784, at: 210, dur: 110, gain: 0.3 },
        { freq: 1046, at: 315, dur: 380, gain: 0.34 },
    ],
    // Рекорд — то же, но выше и с финальным блеском.
    record: [
        { freq: 659, dur: 90, gain: 0.3 },
        { freq: 880, at: 85, dur: 90, gain: 0.3 },
        { freq: 1046, at: 170, dur: 90, gain: 0.32 },
        { freq: 1318, at: 255, dur: 420, gain: 0.34 },
        { freq: 1975, at: 255, dur: 420, gain: 0.12 },
    ],
    tick: [{ freq: 880, dur: 40, type: "triangle", gain: 0.2 }],
    timeup: [
        { freq: 660, dur: 140, gain: 0.3 },
        { freq: 440, at: 130, dur: 320, gain: 0.3 },
    ],
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
/** Один раз не завелось — больше не пробуем: без звука приложение работает. */
let broken = false;

type AudioCtor = typeof AudioContext;

function audio(): AudioContext | null {
    if (ctx || broken) return ctx;

    const Ctor: AudioCtor | undefined =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) {
        broken = true;
        return null;
    }

    try {
        ctx = new Ctor();
        master = ctx.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(ctx.destination);
        return ctx;
    } catch {
        broken = true;
        return null;
    }
}

function schedule(target: AudioContext, bus: GainNode, note: Note, startAt: number): void {
    const at = startAt + (note.at ?? 0) / 1000;
    const dur = (note.dur ?? DEFAULT_DUR_MS) / 1000;
    const peak = note.gain ?? 0.3;

    const osc = target.createOscillator();
    osc.type = note.type ?? "sine";
    osc.frequency.setValueAtTime(note.freq, at);
    if (note.glide) osc.frequency.exponentialRampToValueAtTime(note.glide, at + dur);

    // Экспонента не умеет приходить в ноль, поэтому края огибающей — 0.0001.
    const env = target.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(peak, at + Math.min(ATTACK_S, dur / 2));
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    osc.connect(env);
    env.connect(bus);
    osc.start(at);
    // Хвост после спада: осциллятор, остановленный ровно в конце рампы,
    // на части браузеров успевает щёлкнуть.
    osc.stop(at + dur + 0.03);
}

/** Проигрывает сигнал. Звук выключен, вкладка без Web Audio, контекст не
 *  проснулся — молча ничего не делает: на саму тренировку это не влияет. */
export function play(cue: Cue): void {
    if (!soundEnabled()) return;

    const target = audio();
    if (!target || !master) return;
    if (target.state === "suspended") void target.resume().catch(() => {});

    const startAt = target.currentTime;
    for (const note of CUES[cue]) schedule(target, master, note, startAt);
}

/** Будит звук на первом же касании.
 *
 * iOS и Chrome не дают создать работающий AudioContext вне жеста пользователя,
 * а первый сигнал в спринте может прийти от таймера («минута вышла»), когда
 * жеста уже нет. Поэтому контекст готовим заранее — на первом касании экрана.
 * Пока звук выключен, слушатели остаются на месте: его могут включить позже. */
export function primeSound(): void {
    const unlock = () => {
        if (!soundEnabled()) return;
        document.removeEventListener("pointerdown", unlock);
        document.removeEventListener("keydown", unlock);
        const target = audio();
        if (target?.state === "suspended") void target.resume().catch(() => {});
    };

    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
}
