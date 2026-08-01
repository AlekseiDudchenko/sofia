/* Генерация PNG-иконок без внешних зависимостей.
 *
 * Иконка складывается из десятка простых фигур (капсула, полоса, круги, косой
 * крест), поэтому растеризуется аналитически по знаковому расстоянию, а PNG
 * собирается из zlib, который есть в самом Node. Так в проекте не заводится ни
 * sharp, ни ImageMagick ради четырёх картинок, которые меняются раз в никогда.
 *
 * Рисуем миньона, у которого вместо зрачка знак умножения: на домашнем экране
 * значок опознаётся ребёнком по жёлтому силуэту, а не по названию.
 *
 * Держать это в согласии с web/icons/icon.svg приходится вручную — там та же
 * фигура, но контурами. Расхождение увидит только глаз, тестом его не поймать.
 *
 * Запуск вручную после правки иконки: node scripts/make-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const OUT_DIR = new URL("../web/icons/", import.meta.url);

// ── Растеризация ──────────────────────────────────────────────────────────

function mix(a, b, t) {
    return a + (b - a) * t;
}

/** Плавный переход по знаковому расстоянию — даёт сглаженный край. */
function coverage(distance) {
    return Math.min(1, Math.max(0, 0.5 - distance));
}

function roundedRectDistance(x, y, halfW, halfH, radius) {
    const dx = Math.abs(x) - (halfW - radius);
    const dy = Math.abs(y) - (halfH - radius);
    const ox = Math.max(dx, 0);
    const oy = Math.max(dy, 0);
    return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - radius;
}

function segmentDistance(px, py, ax, ay, bx, by) {
    const vx = bx - ax;
    const vy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** Пересечение фигур по знаковому расстоянию — этим фигура «обрезается» по
 *  телу: полоса очков и комбинезон нарисованы во всю ширину и живут только
 *  там, где под ними жёлтая капсула. */
function intersect(a, b) {
    return Math.max(a, b);
}

/* Пропорции фигуры в долях от стороны иконки, от её центра. Одни и те же
 * числа лежат в web/icons/icon.svg — там они умножены на 512. */
const BODY_W = 0.19;
const BODY_H = 0.30;
const EYE_Y = -0.085;
const GOGGLE_R = 0.155;
const WHITE_R = 0.118;
const STRAP_H = 0.038;
const OVERALLS_Y = 0.105;
const CROSS_ARM = 0.062;
const CROSS_HALF = 0.021;
const HAIR_HALF = 0.011;

function renderIcon(size, { maskable }) {
    const pixels = Buffer.alloc(size * size * 4);
    const half = size / 2;
    const radius = maskable ? 0 : size * 0.22;
    // У maskable-иконки края срезает система: фон разливаем на весь квадрат,
    // а самого миньона ужимаем в безопасную центральную зону.
    const s = size * (maskable ? 0.78 : 1);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            // Координаты от центра иконки — в них и заданы все пропорции.
            const px = x + 0.5 - half;
            const py = y + 0.5 - half;

            const bgAlpha = maskable ? 1 : coverage(roundedRectDistance(px, py, half, half, radius));

            // Диагональный градиент, как в SVG: #7c6cff → #4c3fd0
            const t = (px + py + size) / (2 * size);
            let r = mix(0x7c, 0x4c, t);
            let g = mix(0x6c, 0x3f, t);
            let b = mix(0xff, 0xd0, t);

            const paint = (distance, cr, cg, cb) => {
                const alpha = coverage(distance);
                if (alpha <= 0) return;
                r = mix(r, cr, alpha);
                g = mix(g, cg, alpha);
                b = mix(b, cb, alpha);
            };

            // Волоски торчат из-за головы, поэтому идут до тела.
            const hair = Math.min(
                segmentDistance(px, py, -0.03 * s, -BODY_H * s, -0.065 * s, -0.355 * s),
                segmentDistance(px, py, 0.03 * s, -BODY_H * s, 0.065 * s, -0.355 * s),
            );
            paint(hair - HAIR_HALF * s, 0x23, 0x27, 0x3f);

            // Тело — капсула: радиус скругления равен половине ширины.
            const body = roundedRectDistance(px, py, BODY_W * s, BODY_H * s, BODY_W * s);
            paint(body, 0xff, 0xd9, 0x3b);
            paint(intersect(body, OVERALLS_Y * s - py), 0x4d, 0x8c, 0xe8);
            paint(intersect(body, Math.abs(py - EYE_Y * s) - STRAP_H * s), 0x23, 0x27, 0x3f);

            const eye = Math.hypot(px, py - EYE_Y * s);
            paint(eye - GOGGLE_R * s, 0xc7, 0xd0, 0xe2);
            const white = eye - WHITE_R * s;
            paint(white, 0xff, 0xff, 0xff);

            // Знак умножения вместо зрачка — обрезан по белку глаза.
            const arm = CROSS_ARM * s * 0.7071;
            const cross = Math.min(
                segmentDistance(px, py - EYE_Y * s, -arm, -arm, arm, arm),
                segmentDistance(px, py - EYE_Y * s, arm, -arm, -arm, arm),
            );
            paint(intersect(cross - CROSS_HALF * s, white), 0x4c, 0x3f, 0xd0);

            const offset = (y * size + x) * 4;
            pixels[offset] = Math.round(r);
            pixels[offset + 1] = Math.round(g);
            pixels[offset + 2] = Math.round(b);
            pixels[offset + 3] = Math.round(bgAlpha * 255);
        }
    }
    return pixels;
}

// ── Сборка PNG ────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();

function crc32(buffer) {
    let c = -1;
    for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixels) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;   // бит на канал
    ihdr[9] = 6;   // RGBA
    ihdr[10] = 0;  // deflate
    ihdr[11] = 0;  // фильтрация
    ihdr[12] = 0;  // без интерлейса

    // Каждая строка предваряется байтом фильтра 0 («без фильтра»).
    const stride = size * 4;
    const raw = Buffer.alloc((stride + 1) * size);
    for (let y = 0; y < size; y++) {
        raw[y * (stride + 1)] = 0;
        pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

// ── Точка входа ───────────────────────────────────────────────────────────

const TARGETS = [
    { file: "icon-192.png", size: 192, maskable: false },
    { file: "icon-512.png", size: 512, maskable: false },
    { file: "icon-maskable-512.png", size: 512, maskable: true },
    { file: "apple-touch-icon.png", size: 180, maskable: true },
];

mkdirSync(OUT_DIR, { recursive: true });
for (const { file, size, maskable } of TARGETS) {
    writeFileSync(new URL(file, OUT_DIR), encodePng(size, renderIcon(size, { maskable })));
    console.log(`${file} — ${size}×${size}`);
}
