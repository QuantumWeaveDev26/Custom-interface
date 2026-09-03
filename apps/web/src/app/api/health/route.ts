import { prisma } from "@creative-ai/db";
import { NextResponse } from "next/server";

import { getPublisher } from "@/server/redis";

/**
 * Is this box actually serving?
 *
 * Deliberately public: the thing that asks is a load balancer, an uptime
 * monitor or Docker's own restart policy, and none of those can sign in. It
 * answers with a status code and nothing else — no versions, no error text, no
 * hostnames — so that being public costs nothing.
 *
 * It checks the two dependencies whose absence makes the site useless while
 * still returning HTML: the database behind every page, and the Redis the
 * queue runs on. A web process that is up but cannot reach either is down as
 * far as anyone using it is concerned.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await getPublisher().ping();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
