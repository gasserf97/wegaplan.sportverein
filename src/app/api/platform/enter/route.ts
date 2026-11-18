import { setSessionCookie } from "@/lib/auth";
import { readPlatformEnterToken } from "@/lib/platform-auth";
import { prisma } from "@/lib/prisma";
import { currentClubId } from "@/lib/tenant";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) return new Response("Token fehlt", { status: 400 });

  let claims: { userId: string; platformAdminId: string } | null = null;
  try {
    claims = await readPlatformEnterToken(token);
  } catch {
    return new Response("Token ungültig", { status: 400 });
  }
  if (!claims) return new Response("Token ungültig", { status: 400 });

  const clubId = await currentClubId();
  const user = await prisma.user.findUnique({
    where: { id: claims.userId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      role: true,
      clubId: true,
    },
  });
  if (!user || user.role !== "ADMIN" || !clubId || user.clubId !== clubId) {
    return new Response("Admin gehört nicht zu diesem Verein", { status: 403 });
  }

  await setSessionCookie(
    {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
    },
    { platformImpersonatorId: claims.platformAdminId },
  );

  return Response.redirect(new URL("/", request.url));
}
