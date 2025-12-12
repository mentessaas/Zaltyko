const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/app/dashboard/profile/page.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Reemplazar la consulta incorrecta para atletas
const searchPattern = `  // Athlete: mostrar perfil de atleta
  if (role === "athlete") {
    // Buscar el atleta asociado a este usuario a través de memberships
    const athleteMemberships = await db
      .select({
        academyId: memberships.academyId,
      })
      .from(memberships)
      .where(and(eq(memberships.userId, targetProfile.userId), eq(memberships.role, "athlete")))
      .limit(1);

    if (athleteMemberships.length === 0) {
      return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-6">
            <p className="text-sm text-amber-900">
              No se encontró un perfil de atleta asociado a tu cuenta. Contacta con el administrador.
            </p>
          </div>
        </div>
      );
    }

    const academyId = athleteMemberships[0].academyId;`;

const replacement = `  // Athlete: mostrar perfil de atleta
  if (role === "athlete") {
    // Los atletas no tienen memberships, tienen un registro directo en la tabla athletes
    // que está vinculado al profile.userId
    const [athleteRecord] = await db
      .select({
        id: athletes.id,
        academyId: athletes.academyId,
      })
      .from(athletes)
      .where(eq(athletes.userId, targetProfile.userId))
      .limit(1);

    if (!athleteRecord) {
      return (
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="rounded-lg border border-amber-400/60 bg-amber-400/10 p-6">
            <p className="text-sm text-amber-900">
              No se encontró un perfil de atleta asociado a tu cuenta. Contacta con el administrador.
            </p>
          </div>
        </div>
      );
    }

    const academyId = athleteRecord.academyId;`;

if (content.includes(searchPattern)) {
  content = content.replace(searchPattern, replacement);
  fs.writeFileSync(filePath, content);
  console.log('✅ Archivo dashboard/profile/page.tsx corregido exitosamente');
} else {
  console.log('❌ No se encontró el patrón exacto. Buscando alternativa...');
  
  // Intentar con un patrón más corto
  const shortPattern = `eq(memberships.role, "athlete")`;
  if (content.includes(shortPattern)) {
    console.log('❌ El archivo contiene el error de tipo "athlete" en memberships.role');
    console.log('❌ Los atletas no tienen memberships. Necesita corrección manual.');
    process.exit(1);
  } else {
    console.log('✅ El archivo ya está corregido o no contiene el error específico');
  }
}