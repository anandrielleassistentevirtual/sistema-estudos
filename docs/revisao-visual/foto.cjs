// uso: node foto.cjs <rota> <prefixo-de-saida> [pc|cel|ambos] [escuro|claro]
// grava <prefixo>-pc.png (1440 px) e/ou <prefixo>-cel.png (390 px), página inteira, com login de teste (dados de exemplo)
const { chromium } = require("playwright");
const b64u = (s) => Buffer.from(s).toString("base64url");
const jwt = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" })) + "." + b64u(JSON.stringify({ sub: "u1", role: "authenticated", aud: "authenticated", exp: 4102444800 })) + ".sig";
const session = { access_token: jwt, refresh_token: "r", expires_at: 4102444800, expires_in: 3600, token_type: "bearer", user: { id: "u1", user_metadata: { nome: "Anandrielle" } } };
const [rota, prefixo, qual = "ambos", tema = "escuro"] = process.argv.slice(2);
if (!rota || !prefixo) { console.log("uso: node foto.cjs <rota> <prefixo> [pc|cel|ambos] [escuro|claro]"); process.exit(1); }
(async () => {
  const br = await chromium.launch();
  const tams = [["pc", 1440, 900], ["cel", 390, 844]].filter(([t]) => qual === "ambos" || qual === t);
  for (const [t, w, h] of tams) {
    const ctx = await br.newContext({ viewport: { width: w, height: h }, colorScheme: tema === "claro" ? "light" : "dark" });
    await ctx.addCookies([{ name: "sb-localhost-auth-token", value: "base64-" + b64u(JSON.stringify(session)), domain: "localhost", path: "/" }]);
    await ctx.addInitScript((tm) => { try { localStorage.setItem("tema", tm); } catch {} }, tema === "claro" ? "light" : "dark");
    const p = await ctx.newPage();
    const erros = [];
    p.on("pageerror", (e) => erros.push(e.message.slice(0, 200)));
    try { await p.goto("http://localhost:3100" + rota, { waitUntil: "networkidle", timeout: 90000 }); } catch { erros.push("timeout ao carregar"); }
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${prefixo}-${t}.png`, fullPage: true });
    const H = await p.evaluate(() => document.documentElement.scrollHeight);
    const larg = await p.evaluate(() => document.documentElement.scrollWidth);
    console.log(`${prefixo}-${t}.png  altura=${H}  largura_rolavel=${larg}${larg > w ? " (ROLAGEM HORIZONTAL!)" : ""}${erros.length ? "  ERROS: " + erros.join(" | ") : ""}`);
    await ctx.close();
  }
  await br.close();
})();
