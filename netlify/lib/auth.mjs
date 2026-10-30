import { timingSafeEqual } from "node:crypto";

// Controlla la password admin passata nell'header "x-admin-password".
// La password vera si imposta su Netlify come variabile d'ambiente ADMIN_PASSWORD.
export function checkAuth(req) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) {
    return Response.json(
      { error: "Manca la variabile ADMIN_PASSWORD nelle impostazioni Netlify" },
      { status: 500 }
    );
  }
  const got = req.headers.get("x-admin-password") || "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return Response.json({ error: "Password errata" }, { status: 401 });
  }
  return null;
}
