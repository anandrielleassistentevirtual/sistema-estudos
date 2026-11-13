import { redirect } from "next/navigation";

/** O Anki agora fica dentro de cada idioma (Idiomas): o endereço antigo leva para lá. */
export default function AnkiAntigo() {
  redirect("/idiomas");
}
