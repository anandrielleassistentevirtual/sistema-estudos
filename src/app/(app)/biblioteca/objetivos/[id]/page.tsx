import { redirect } from "next/navigation";

/** Cada mesa abre dentro do Plano de leitura. */
export default async function Mesa({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/biblioteca#mesa-${id}`);
}
