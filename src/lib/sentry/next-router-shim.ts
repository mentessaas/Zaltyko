type RouterEventHandler = (...args: unknown[]) => void;

const events = {
  on(_event: string, _handler: RouterEventHandler) {
    return undefined;
  },
  off(_event: string, _handler: RouterEventHandler) {
    return undefined;
  },
  emit(_event: string, ..._args: unknown[]) {
    return undefined;
  },
};

const router = {
  events,
};

export { events };
export default router;
