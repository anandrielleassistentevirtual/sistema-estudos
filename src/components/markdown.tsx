"use client";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** Markdown com tabelas/listas do GFM. Fica num arquivo à parte para ser carregado só quando aparece. */
export default function Markdown({ children, components }: { children: string; components?: Components }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} urlTransform={(u) => u} components={components}>
      {children}
    </ReactMarkdown>
  );
}
