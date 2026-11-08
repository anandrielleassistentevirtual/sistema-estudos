"use client";
import { NotesWorkspace } from "@/components/notes-workspace";
import { NotasTabs } from "@/components/notas-tabs";

export default function Atomicas() {
  return <NotesWorkspace kind="atomica" tabs={<NotasTabs className="" />} />;
}
