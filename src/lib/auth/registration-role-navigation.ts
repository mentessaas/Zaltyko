export function getNextRegistrationRoleIndex(
  key: string,
  currentIndex: number,
  optionCount: number
): number | null {
  if (
    !Number.isInteger(currentIndex) ||
    !Number.isInteger(optionCount) ||
    optionCount < 1 ||
    currentIndex < 0 ||
    currentIndex >= optionCount
  ) {
    return null;
  }

  const lastIndex = optionCount - 1;
  switch (key) {
    case "ArrowDown":
    case "ArrowRight":
      return currentIndex === lastIndex ? 0 : currentIndex + 1;
    case "ArrowUp":
    case "ArrowLeft":
      return currentIndex === 0 ? lastIndex : currentIndex - 1;
    case "Home":
      return 0;
    case "End":
      return lastIndex;
    default:
      return null;
  }
}
