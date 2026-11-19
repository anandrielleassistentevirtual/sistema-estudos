"use client";
import { GraduationCap, ListChecks } from "lucide-react";
import { TabNav } from "./tab-nav";

/** Abas dos Estudos: as aulas (transcrições) e as tarefas. */
export function EstudosTabs() {
  return (
    <TabNav rotulo="Estudos" abas={[
      { href: "/estudos", label: "Aulas", icon: GraduationCap, exata: true },
      { href: "/estudos/tarefas", label: "Tarefas", icon: ListChecks },
    ]} />
  );
}
