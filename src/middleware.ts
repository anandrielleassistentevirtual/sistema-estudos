import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // api/listening: instalação do script pela extensão (sem login; protegida pelo código de 30 min)
  // api/saude: o atalho do iPhone manda passos e sono (sem login; protegido pela chave pessoal)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|api/listening/|api/saude|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
