/** Helper para serializar respuestas con la envoltura `apiSuccess` de Zaltyko. */
export function unwrapData<T>(payload: { data?: T; ok?: boolean }): T | undefined {
  return payload?.data;
}
