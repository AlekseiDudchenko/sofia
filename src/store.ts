/** Хранилище прогресса — localStorage устройства и больше ничего.
 *
 * Ни бэкенда, ни базы, ни аккаунта: приложение целиком статическое. Плата за
 * это — очистка данных сайта стирает прогресс, поэтому есть exportAll/importAll
 * (кнопка «Сохранить копию» на главной).
 */

import { newCard, type CardState } from "./scheduler.js";

const CARDS_KEY = "sofia.cards.v1";
const DAYS_KEY = "sofia.days.v1";
const SPRINT_KEY = "sofia.sprint.v1";
const MARATHON_KEY = "sofia.marathon.v1";
const SOUND_KEY = "sofia.sound.v1";

/** Ответов в день, чтобы день засчитался в серию. */
export const DAILY_GOAL = 30;

export interface DayStats {
    answers: number;
    correct: number;
}

type DayMap = Record<string, DayStats>;

function read<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        return fallback;
    }
}

function write(key: string, value: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Приватный режим или переполненное хранилище: тренироваться это не
        // мешает, теряется только история. Молча продолжаем.
    }
}

// ── Карточки ──────────────────────────────────────────────────────────────

export function loadCards(): Map<string, CardState> {
    const rows = read<CardState[]>(CARDS_KEY, []);
    return new Map(rows.map((c) => [c.id, c]));
}

export function saveCards(cards: ReadonlyMap<string, CardState>): void {
    write(CARDS_KEY, Array.from(cards.values()));
}

export function getOrCreate(cards: Map<string, CardState>, id: string, today: string): CardState {
    const existing = cards.get(id);
    if (existing) return existing;
    const fresh = newCard(id, today);
    cards.set(id, fresh);
    return fresh;
}

// ── Дневная статистика и серия ────────────────────────────────────────────

export function loadDays(): DayMap {
    return read<DayMap>(DAYS_KEY, {});
}

export function recordAnswer(today: string, correct: boolean): DayStats {
    const days = loadDays();
    const day = days[today] ?? { answers: 0, correct: 0 };
    day.answers++;
    if (correct) day.correct++;
    days[today] = day;
    write(DAYS_KEY, days);
    return day;
}

export function todayStats(today: string): DayStats {
    return loadDays()[today] ?? { answers: 0, correct: 0 };
}

/** Длина серии: сколько дней подряд норма выполнялась.
 *
 * Сегодняшний недобор серию ещё не рвёт — день не кончился, и показывать
 * ребёнку «серия 0» в полдень было бы просто неверно. */
export function streakDays(today: string, days: DayMap = loadDays()): number {
    const met = (day: string) => (days[day]?.answers ?? 0) >= DAILY_GOAL;

    let cursor = today;
    let streak = 0;
    if (met(cursor)) streak = 1;
    cursor = shiftDay(cursor, -1);

    for (let i = 0; i < 400 && met(cursor); i++) {
        streak++;
        cursor = shiftDay(cursor, -1);
    }
    return streak;
}

function shiftDay(day: string, delta: number): string {
    const [y, m, d] = day.split("-").map(Number);
    const date = new Date(y!, m! - 1, d!);
    date.setDate(date.getDate() + delta);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// ── Рекорд спринта ────────────────────────────────────────────────────────

export function bestSprint(): number {
    return read<{ best: number }>(SPRINT_KEY, { best: 0 }).best;
}

export function submitSprint(score: number): boolean {
    if (score <= bestSprint()) return false;
    write(SPRINT_KEY, { best: score });
    return true;
}

// ── Рекорд марафона ───────────────────────────────────────────────────────

export function bestMarathon(): number {
    return read<{ best: number }>(MARATHON_KEY, { best: 0 }).best;
}

export function submitMarathon(score: number): boolean {
    if (score <= bestMarathon()) return false;
    write(MARATHON_KEY, { best: score });
    return true;
}

// ── Звук ──────────────────────────────────────────────────────────────────

/** Звук — настройка устройства, а не прогресс.
 *
 * Поэтому он живёт отдельным ключом: в резервную копию не попадает и
 * «Начать заново» его не трогает. Копию переносят на другой телефон, где
 * своя обстановка — навязывать ей звук из старого было бы неправильно, а
 * стирать выключенный звук вместе с прогрессом — тем более. */
export function soundEnabled(): boolean {
    return read<{ on: boolean }>(SOUND_KEY, { on: true }).on !== false;
}

export function setSoundEnabled(on: boolean): void {
    write(SOUND_KEY, { on });
}

// ── Резервная копия ───────────────────────────────────────────────────────

export interface Backup {
    app: "sofia";
    version: 1;
    savedAt: string;
    cards: CardState[];
    days: DayMap;
    sprint: { best: number };
    marathon: { best: number };
}

export function exportAll(): Backup {
    return {
        app: "sofia",
        version: 1,
        savedAt: new Date().toISOString(),
        cards: Array.from(loadCards().values()),
        days: loadDays(),
        sprint: { best: bestSprint() },
        marathon: { best: bestMarathon() },
    };
}

export function importAll(raw: unknown): boolean {
    const data = raw as Partial<Backup> | null;
    if (!data || data.app !== "sofia" || !Array.isArray(data.cards)) return false;
    write(CARDS_KEY, data.cards);
    write(DAYS_KEY, data.days ?? {});
    write(SPRINT_KEY, data.sprint ?? { best: 0 });
    // Копия, снятая до появления марафона, поля не содержит: рекорд обнуляется
    // вместе с остальным прогрессом — копия заменяет состояние целиком.
    write(MARATHON_KEY, data.marathon ?? { best: 0 });
    return true;
}

export function resetAll(): void {
    for (const key of [CARDS_KEY, DAYS_KEY, SPRINT_KEY, MARATHON_KEY]) {
        try { localStorage.removeItem(key); } catch { /* см. write() */ }
    }
}
