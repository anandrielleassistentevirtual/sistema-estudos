import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // api/listening: instalação do script pela extensão (sem login; protegida pelo código de 30 min)
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/|api/listening/|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
