import { auth } from "@/auth";
import { prismaStore } from "@creative-ai/db";
import { NextRequest, NextResponse } from "next/server";
import { createSubscriber } from "@/server/redis";

const HEARTBEAT_INTERVAL_MS = 30_000;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: jobId } = await params;

  const job = await prismaStore.job.findUnique({ where: { id: jobId } });

  if (!job || job.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const channel = `job:${jobId}`;

  const readable = new ReadableStream({
    async start(controller) {
      let closed = false;
      const subscriber = createSubscriber();

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        subscriber.off("message", onMessage);
        void subscriber.quit();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      };

      const onMessage = (subscribedChannel: string, message: string) => {
        if (closed || subscribedChannel !== channel) return;
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
        try {
          const event = JSON.parse(message) as { status?: string };
          if (event.status === "complete" || event.status === "failed") {
            cleanup();
          }
        } catch {
          // Ignore malformed event payloads.
        }
      };

      subscriber.on("message", onMessage);

      // Subscribe before reading the snapshot so an event published between
      // the two cannot be lost between the read and the subscription.
      await subscriber.subscribe(channel);

      const snapshot = await prismaStore.job.findUnique({ where: { id: jobId } });
      if (snapshot) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              jobId: snapshot.id,
              status: snapshot.status,
              errorMessage: snapshot.errorMessage,
            })}\n\n`,
          ),
        );
        if (snapshot.status === "complete" || snapshot.status === "failed") {
          cleanup();
          return;
        }
      }

      const heartbeat = setInterval(() => {
        if (closed) return;
        controller.enqueue(encoder.encode(": heartbeat\n\n"));
      }, HEARTBEAT_INTERVAL_MS);

      request.signal.addEventListener("abort", cleanup);
    },
  });

  return new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
