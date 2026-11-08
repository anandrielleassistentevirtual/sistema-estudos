"use client";
import { flatTree, folderLabel } from "@/lib/folders";
import type { Folder } from "@/lib/types";

/**
 * Seleção de pasta separada por classe da CDD: cada classe (000, 100, 200…) vira um grupo,
 * com a própria classe e as subpastas embaixo, em ordem de numeração.
 */
export function FolderSelect({
  folders, value, onChange, className = "input", emptyLabel = "Sem pasta", exclude, title,
}: {
  folders: Folder[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  emptyLabel?: string;
  exclude?: Set<string>;
  title?: string;
}) {
  const tree = flatTree(folders).filter(({ folder }) => !exclude?.has(folder.id));
  const groups: { top: Folder; items: { folder: Folder; depth: number }[] }[] = [];
  for (const item of tree) {
    if (item.depth === 0) groups.push({ top: item.folder, items: [item] });
    else groups[groups.length - 1]?.items.push(item);
  }
  return (
    <select className={className} value={value} title={title} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {groups.map((g) => (
        <optgroup key={g.top.id} label={folderLabel(g.top)}>
          {g.items.map(({ folder, depth }) => (
            <option key={folder.id} value={folder.id}>
              {" ".repeat(Math.max(0, depth - 1))}{depth === 0 ? `${folderLabel(folder)} (geral)` : folderLabel(folder)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
