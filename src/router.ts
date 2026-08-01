/** Маршрутизация по хэшу.
 *
 * Именно по хэшу, а не по путям: приложение раздаётся с GitHub Pages из
 * подкаталога, а хэш работает под любым префиксом и не требует ни SPA-фолбэка,
 * ни трюка с 404.html. Для трёх экранов этого более чем достаточно.
 */

export type RouteHandler = (route: string) => void;

let handler: RouteHandler | null = null;

export function currentRoute(): string {
    const raw = location.hash.replace(/^#/, "");
    return raw.startsWith("/") ? raw : "/";
}

export function go(route: string): void {
    const target = `#${route}`;
    // Повторный переход на тот же маршрут («Ещё подход») хэш не меняет,
    // поэтому hashchange не сработает — перерисовываем вручную.
    if (location.hash === target) {
        handler?.(route);
        return;
    }
    location.hash = target;
}

export function startRouter(onRoute: RouteHandler): void {
    handler = onRoute;
    window.addEventListener("hashchange", () => onRoute(currentRoute()));
    onRoute(currentRoute());
}
