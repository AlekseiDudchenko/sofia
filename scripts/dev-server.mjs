/* Локальный сервер для web/. Только стандартная библиотека — у проекта нет
 * зависимостей времени выполнения, и заводить их ради разработки незачем. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, normalize, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../web/", import.meta.url));
const PORT = Number(process.env.PORT ?? 5173);

const TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
};

createServer(async (req, res) => {
    const requested = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    // normalize + отсечение ведущих ".." — чтобы ../../etc/passwd не читался.
    const safe = normalize(requested).replace(/^(\.\.[/\\])+/, "");
    const file = join(ROOT, safe.endsWith("/") ? `${safe}index.html` : safe);

    try {
        const body = await readFile(file);
        res.writeHead(200, {
            "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
            "Cache-Control": "no-cache",
        });
        res.end(body);
    } catch {
        // Маршрутизация по хэшу, поэтому фолбэк нужен только на корень.
        try {
            res.writeHead(200, { "Content-Type": TYPES[".html"] });
            res.end(await readFile(join(ROOT, "index.html")));
        } catch {
            res.writeHead(404).end("not found");
        }
    }
}).listen(PORT, () => console.log(`http://localhost:${PORT}/`));
