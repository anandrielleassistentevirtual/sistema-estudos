import { BibliotecaDados } from "@/components/biblioteca/dados";
import { JanelasDaBiblioteca } from "@/components/biblioteca/janelas";

/** As três abas da Biblioteca dividem os mesmos dados (trocar de aba não recarrega nada). */
export default function BibliotecaLayout({ children }: { children: React.ReactNode }) {
  return (
    <BibliotecaDados>
      {children}
      <JanelasDaBiblioteca />
    </BibliotecaDados>
  );
}
