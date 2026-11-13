import { NextResponse } from "next/server";
import {
  buildCalendarIcs,
  calendarTokenFromParam,
  loadCourseCalendarEvents,
  loadCourtCalendarEvents,
} from "@/lib/calendar-feed";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FEED_HEADERS = {
  "Content-Type": "text/calendar; charset=utf-8",
  // public: Google’s Import-Crawler soll den Feed ohne Session lesen können
  "Cache-Control": "public, max-age=300",
  "Access-Control-Allow-Origin": "*",
} as const;

async function resolveFeed(tokenParam: string) {
  const token = calendarTokenFromParam(tokenParam);
  if (!token) return null;

  const user = await prisma.user.findUnique({
    where: { calendarFeedToken: token },
    select: {
      id: true,
      calendarSyncEnabled: true,
      calendarSyncTennis: true,
      calendarSyncCourses: true,
      calendarSyncChildCourses: true,
    },
  });
  if (!user) return null;

  const events = user.calendarSyncEnabled
    ? [
        ...(user.calendarSyncTennis ? await loadCourtCalendarEvents(user.id) : []),
        ...(await loadCourseCalendarEvents(user.id, {
          includeSelf: user.calendarSyncCourses,
          includeChildren: user.calendarSyncChildCourses,
        })),
      ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    : [];
  return buildCalendarIcs(events);
}

export async function HEAD(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token: tokenParam } = await context.params;
  const body = await resolveFeed(tokenParam);
  if (body == null) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(null, {
    status: 200,
    headers: {
      ...FEED_HEADERS,
      "Content-Length": String(Buffer.byteLength(body, "utf8")),
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token: tokenParam } = await context.params;
  const body = await resolveFeed(tokenParam);
  if (body == null) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(body, {
    status: 200,
    headers: FEED_HEADERS,
  });
}
