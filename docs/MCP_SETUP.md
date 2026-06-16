# Configuración de MCP (Model Context Protocol) para Cursor

Este documento explica cómo configurar y usar el servidor MCP de Zaltyko con Cursor para permitir que la IA acceda a información de la aplicación.

## ¿Qué es MCP?

MCP (Model Context Protocol) es un protocolo estándar que permite a los modelos de lenguaje (como los usados en Cursor) comunicarse con herramientas y fuentes de datos externas. En nuestro caso, permite que Cursor acceda directamente a la base de datos de Zaltyko para consultar información sobre academias, atletas, clases, métricas financieras, etc.

## Instalación

Las dependencias ya están instaladas:
- `mcp-handler`: Maneja las solicitudes MCP
- `@modelcontextprotocol/sdk`: SDK oficial de MCP

## Endpoint

El servidor MCP está disponible en:
- **Desarrollo**: `http://localhost:3000/api/mcp`
- **Producción**: `https://tu-dominio.com/api/mcp`

## Configurar Cursor

### 1. Abrir configuración de MCP en Cursor

1. Abre Cursor
2. Ve a **Settings** → **Features** → **Model Context Protocol**
3. O busca "MCP" en la configuración

### 2. Agregar servidor MCP

Agrega un nuevo servidor MCP con la siguiente configuración:

**Para desarrollo local:**
- **Nombre**: `Zaltyko Local`
- **URL**: `http://localhost:3000/api/mcp`
- **Método**: `HTTP`
- **Descripción**: `Servidor MCP local para desarrollo`

**Para producción:**
- **Nombre**: `Zaltyko Production`
- **URL**: `https://tu-dominio.com/api/mcp`
- **Método**: `HTTP`
- **Descripción**: `Servidor MCP de producción`

### 3. Verificar conexión

Una vez configurado, Cursor debería poder conectarse al servidor MCP. Puedes probarlo haciendo una pregunta como:

- "Obtén las estadísticas del sistema"
- "Lista todas las academias en España"
- "Muestra información de la academia con ID..."

## Herramientas Disponibles

El servidor MCP proporciona las siguientes herramientas:

### 📊 Consultas de Datos

1. **`get_academy_info`**
   - Obtiene información completa de una academia por ID
   - Parámetros: `academyId` (UUID)
   - Ejemplo: "Obtén información de la academia con ID abc-123..."

2. **`list_academies`**
   - Lista academias con filtros opcionales
   - Parámetros: `country`, `region`, `city`, `academyType`, `limit`
   - Ejemplo: "Lista todas las academias en Málaga"

3. **`get_academy_athletes`**
   - Obtiene la lista de atletas de una academia
   - Parámetros: `academyId`, `status` (active/inactive/all), `limit`
   - Ejemplo: "Muestra todos los atletas activos de la academia X"

4. **`get_academy_classes`**
   - Obtiene las clases programadas de una academia
   - Parámetros: `academyId`, `limit`
   - Ejemplo: "Lista todas las clases de la academia Y"

5. **`get_academy_financial_metrics`**
   - Obtiene métricas financieras de una academia
   - Parámetros: `academyId`, `month` (opcional, formato YYYY-MM)
   - Ejemplo: "Muestra las métricas financieras de la academia Z para diciembre 2024"

6. **`get_academy_events`**
   - Obtiene eventos de una academia
   - Parámetros: `academyId`, `limit`
   - Ejemplo: "Lista los próximos eventos de la academia X"

7. **`get_user_profile`**
   - Obtiene información de un perfil de usuario
   - Parámetros: `userId` (UUID)
   - Ejemplo: "Muestra el perfil del usuario con ID..."

### 🔍 Análisis y Debugging

8. **`get_system_stats`**
   - Obtiene estadísticas generales del sistema
   - Sin parámetros
   - Ejemplo: "Muestra las estadísticas del sistema"

9. **`search_academies`**
   - Busca academias por nombre (búsqueda parcial)
   - Parámetros: `query`, `limit`
   - Ejemplo: "Busca academias que contengan 'gimnasia'"

10. **`check_database_connection`**
    - Verifica el estado de la conexión a la base de datos
    - Sin parámetros
    - Ejemplo: "Verifica la conexión a la base de datos"

## Ejemplos de Uso

### Consultar información de una academia

```
Usuario: "Obtén información completa de la academia con ID f3cb13e9-bb74-4a09-803e-a6f62cec27cc"

Cursor: [Usa get_academy_info]
```

### Buscar academias por ubicación

```
Usuario: "Lista todas las academias de gimnasia artística en Málaga"

Cursor: [Usa list_academies con academyType='artistica' y city='Málaga']
```

### Analizar métricas financieras

```
Usuario: "Muestra las métricas financieras de la academia X para el mes actual"

Cursor: [Usa get_academy_financial_metrics]
```

### Obtener estadísticas del sistema

```
Usuario: "¿Cuántas academias y atletas hay en el sistema?"

Cursor: [Usa get_system_stats]
```

## Seguridad

⚠️ **Importante**: El servidor MCP actualmente no tiene autenticación. Esto significa que cualquier persona con acceso a la URL puede consultar datos.

### Recomendaciones para producción:

1. **Agregar autenticación**: Implementar un sistema de autenticación basado en tokens
2. **Rate limiting**: Limitar el número de solicitudes por IP
3. **CORS**: Configurar CORS apropiadamente
4. **Solo lectura**: Las herramientas actuales son de solo lectura, lo cual es seguro

## Troubleshooting

### El servidor MCP no responde

1. Verifica que el servidor de desarrollo esté corriendo: `pnpm dev`
2. Verifica que el endpoint esté accesible: `curl http://localhost:3000/api/mcp`
3. Revisa los logs del servidor para errores

### Cursor no puede conectarse

1. Verifica que la URL sea correcta (sin trailing slash)
2. Asegúrate de que el servidor esté corriendo antes de configurar Cursor
3. Revisa la configuración de red/firewall

### Errores de base de datos

1. Verifica que las variables de entorno estén configuradas correctamente
2. Verifica la conexión a la base de datos usando `check_database_connection`
3. Revisa los logs del servidor para detalles del error

## Extender el Servidor MCP

Para agregar nuevas herramientas, edita `src/app/api/mcp/route.ts` y agrega nuevas herramientas usando `server.tool()`:

```typescript
server.tool(
  'nombre_de_la_herramienta',
  'Descripción de lo que hace',
  {
    parametro1: z.string(),
    parametro2: z.number().optional(),
  },
  async ({ parametro1, parametro2 }) => {
    // Lógica de la herramienta
    return {
      content: [{ type: 'text', text: 'Resultado' }],
    };
  }
);
```

## Recursos

- [Documentación oficial de MCP](https://modelcontextprotocol.io/)
- [mcp-handler en GitHub](https://github.com/vercel/mcp-adapter)
- [Documentación de Vercel sobre MCP](https://vercel.com/docs/mcp)

