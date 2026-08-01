/* Генерация PNG-иконок без внешних зависимостей.
 *
 * Иконка простая (скруглённый квадрат с косым крестом), поэтому растеризуется
 * аналитически по знаковому расстоянию, а PNG собирается из zlib, который есть
 * в самом Node. Так в проекте не заводится ни sharp, ни ImageMagick ради
 * четырёх картинок, которые меняются раз в никогда.
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

function roundedBoxDistance(x, y, half, radius) {
    const dx = Math.abs(x) - (half - radius);
    const dy = Math.abs(y) - (half - radius);
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

function renderIcon(size, { maskable }) {
    const pixels = Buffer.alloc(size * size * 4);
    const half = size / 2;
    const radius = maskable ? 0 : size * 0.22;
    // У maskable-иконки углы срезает система, поэтому крест держим в
    // безопасной центральной зоне, а фон разливаем на весь квадрат.
    const armFrom = maskable ? size * 0.36 : size * 0.34;
    const armTo = size - armFrom;
    const strokeHalf = size * (maskable ? 0.049 : 0.053);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const cx = x + 0.5;
            const cy = y + 0.5;

            const bgAlpha = maskable
                ? 1
                : coverage(roundedBoxDistance(cx - half, cy - half, half, radius));

            // Диагональный градиент, как в SVG: #7c6cff → #4c3fd0
            const t = (cx + cy) / (2 * size);
            let r = mix(0x7c, 0x4c, t);
            let g = mix(0x6c, 0x3f, t);
            let b = mix(0xff, 0xd0, t);

            const cross = Math.min(
                segmentDistance(cx, cy, armFrom, armFrom, armTo, armTo),
                segmentDistance(cx, cy, armTo, armFrom, armFrom, armTo),
            );
            const crossAlpha = coverage(cross - strokeHalf);

            r = mix(r, 255, crossAlpha);
            g = mix(g, 255, crossAlpha);
            b = mix(b, 255, crossAlpha);

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
