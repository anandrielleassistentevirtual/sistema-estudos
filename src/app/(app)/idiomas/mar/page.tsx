import { redirect } from "next/navigation";

/** O MAR agora fica dentro de Idiomas (seção própria, com os indicadores). */
export default function ListaDoMar() {
  redirect("/idiomas#mar");
}
