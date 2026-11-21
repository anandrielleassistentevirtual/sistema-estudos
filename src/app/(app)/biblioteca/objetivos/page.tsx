import { redirect } from "next/navigation";

/** As mesas agora fazem parte do Plano de leitura. */
export default function Mesas() {
  redirect("/biblioteca");
}
