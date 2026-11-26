import { Page } from "@/components/page";
import { StoragePanel } from "@/components/storage-panel";

export default function Armazenamento() {
  // sem manchete: os números estão nos cartões logo abaixo; a explicação fica no (i)
  return (
    <Page title="Armazenamento" ajuda="Espaço usado no plano gratuito e cópia de segurança de tudo o que está no sistema.">
      <StoragePanel />
    </Page>
  );
}
