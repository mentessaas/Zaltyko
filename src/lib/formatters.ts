export function formatAcademyType(value: string | null | undefined): string {
  switch (value) {
    case "artistica":
      return "Gimnasia artística";
    case "ritmica":
      return "Gimnasia rítmica";
    case "general":
      return "Mixta artística/rítmica";
    default:
      return "Disciplina no definida";
  }
}
