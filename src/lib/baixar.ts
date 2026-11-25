"use client";
/** Baixa um Blob/arquivo com o nome dado: cria um <a>, clica e limpa (libera a URL depois). */
export function baixarArquivo(blob: Blob, nome: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href); }, 10000);
}
