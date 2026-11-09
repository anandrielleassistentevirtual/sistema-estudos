import { Page } from "@/components/page";
import { StoragePanel } from "@/components/storage-panel";

export default function Armazenamento() {
  return (
    <Page title="Armazenamento" subtitle="Espaço usado no plano gratuito e cópia de segurança de tudo o que está no sistema.">
      <StoragePanel />
    </Page>
  );
}
