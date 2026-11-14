import { ownerUi } from "@/components/owner-dashboard/owner-ui";

/**
 * El portal de familias figura como «En preparación» en la web pública. La demo
 * lo enseña tal y como se verá, y lo dice, para no prometer lo que aún no está
 * abierto a las academias.
 */
export function DemoFamilyNote() {
  return (
    <p className={`${ownerUi.noticeInfo} mb-6`} role="note">
      El portal de familias está en preparación. Esto es una vista previa con datos ficticios de cómo lo verá una familia.
    </p>
  );
}
