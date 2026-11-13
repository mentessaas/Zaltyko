import { fieldControlClassName } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// Piezas del alta de academia y de los cobros de `/owner` que componen la
// familia compartida de `components/ui` (DESIGN.md, «Una sola familia de
// componentes») sin tocar `owner-ui.ts`:
// - `ownerField`: el campo de `components/ui` (radio de 10 px, 44 px de alto,
//   foco tapiz), a 16 px en móvil para que iOS no amplíe la página.
// - `ownerNoticeAviso`: aviso en ocre (pendiente, revisar antes de seguir),
//   con la misma forma que `ownerUi.notice*`. El aviso de `ownerUi` sigue en
//   lavado de señal hasta el PR-R; cuando pase a ocre, este tono se retira.
export const ownerField = cn(fieldControlClassName, "px-3 text-base sm:text-sm");

export const ownerNoticeAviso =
  "rounded-md border border-ochre-line bg-ochre-wash p-4 text-sm leading-6 text-ochre-ink";
