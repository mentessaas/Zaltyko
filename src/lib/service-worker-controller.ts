export function createControllerChangeHandler(options: {
  initialHasController: boolean;
  shouldReload: () => boolean;
  reload: () => void;
}) {
  let hasController = options.initialHasController;

  return () => {
    // First control only takes over the current page; it must not interrupt it.
    if (!hasController) {
      hasController = true;
      return;
    }

    if (options.shouldReload()) {
      options.reload();
    }
  };
}

export function listenForControllerChange(
  serviceWorker: Pick<
    ServiceWorkerContainer,
    "addEventListener" | "removeEventListener"
  >,
  handler: EventListener
) {
  serviceWorker.addEventListener("controllerchange", handler);
  return () =>
    serviceWorker.removeEventListener("controllerchange", handler);
}
