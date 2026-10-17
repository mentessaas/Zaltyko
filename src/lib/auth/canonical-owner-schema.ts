function errorField(error: unknown, key: string): unknown {
  if (!error || typeof error !== "object") return undefined;
  return (error as Record<string, unknown>)[key];
}

export function isMissingCanonicalOwnerSchema(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    const code = errorField(current, "code");
    const schema = errorField(current, "schema");
    const table = errorField(current, "table");
    const message = String(errorField(current, "message") ?? "");
    const schemaMissingFromMessage =
      schema === undefined &&
      /schema ["']zaltyko["'] does not exist/i.test(message);
    const canonicalRelationMissingFromMessage =
      schema === undefined &&
      /relation ["']zaltyko\.(?:organization_members|organizations)["'] does not exist/i.test(
        message
      );

    if (code === "3F000") {
      return schema === "zaltyko" || schemaMissingFromMessage;
    }

    if (code === "42P01") {
      return (
        (schema === "zaltyko" &&
          (table === "organization_members" || table === "organizations")) ||
        canonicalRelationMissingFromMessage
      );
    }

    // Un error con código propio es concluyente. No ocultar, por ejemplo, una
    // denegación de permisos buscando una ausencia distinta en su causa.
    if (code !== undefined) return false;

    current = errorField(current, "cause");
  }

  return false;
}
