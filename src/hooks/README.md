# Hooks - Custom React Hooks

Este directorio contiene los hooks personalizados del proyecto.

## Hooks Disponibles

### useDebounce
Retrasa un valor hasta que deja de cambiar por un tiempo específico.

```typescript
const debouncedValue = useDebounce(value, 500);
```

### useAthleteForm
Maneja el estado del formulario de atletas.

```typescript
const { formData, updateField, resetForm } = useAthleteForm();
```

### useGlobalSearch
Maneja la búsqueda global en la aplicación.

### useRealtimeNotifications
Recibe notificaciones en tiempo real.

## Agregar un nuevo hook

1. Crear archivo `use-nombre-hook.ts`
2. Exportar función con prefijo `use`
3. Añadir a este README
