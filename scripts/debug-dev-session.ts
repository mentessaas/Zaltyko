import "dotenv/config";

// Nota: ensureDevSessionData ya no está exportado desde el route handler
// Este script está deshabilitado temporalmente
// Para usar este script, mueve la lógica a un módulo compartido en src/lib/
// O usa el endpoint /api/dev/session directamente

async function main() {
  console.log("⚠️  Este script necesita ser actualizado.");
  console.log("La función ensureDevSessionData ya no está disponible como export.");
  console.log("Usa el endpoint /api/dev/session directamente o mueve la lógica a src/lib/");
  process.exit(0);
}

main();
