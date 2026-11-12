export function createSaveTracker(onIdle?: (scope: string) => void) {
  const inflight = new Map<string, number>();
  const chains = new Map<string, Promise<void>>();

  function count(scope: string) {
    return inflight.get(scope) ?? 0;
  }

  function add(scope: string) {
    inflight.set(scope, count(scope) + 1);
  }

  function finish(scope: string) {
    const next = count(scope) - 1;
    inflight.set(scope, Math.max(0, next));
    if (next <= 0) onIdle?.(scope);
  }

  function after(id: string, task: () => Promise<void>) {
    const prev = chains.get(id) ?? Promise.resolve();
    const next = prev.catch(() => undefined).then(task);
    chains.set(
      id,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  }

  return { count, add, finish, after };
}
