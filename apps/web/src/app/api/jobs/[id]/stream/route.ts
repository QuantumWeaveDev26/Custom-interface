import { auth } from "@/auth";
import { prismaStore } from "@creative-ai/db";
import { NextRequest, NextResponse } from "next/server";
import { getPublisher } from "@/server/redis";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const jobId = params.id;

    // Load job and verify ownership
    const job = await prismaStore.job.findUnique({ where: { id: jobId } });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (job.userId !== session.user.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Set up SSE response
    const encoder = new TextEncoder();
    let closed = false;

    const readable = new ReadableStream({
      async start(controller) {
        // Send initial snapshot
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              jobId: job.id,
              status: job.status,
              errorMessage: job.errorMessage,
            })}\n\n`
          )
        );

        const publisher = getPublisher();
        const channel = `job:${jobId}`;

        publisher.subscribe(channel, (err: any) => {
          if (err) {
            console.error("Subscribe error:", err);
            closed = true;
            controller.close();
          }
        });

        publisher.on("message", (subscribedChannel: string, message: string) => {
          if (closed) return;
          if (subscribedChannel === channel) {
            controller.enqueue(encoder.encode(`data: ${message}\n\n`));

            // Check if terminal status
            try {
              const event = JSON.parse(message);
              if (event.status === "complete" || event.status === "failed") {
                publisher.unsubscribe(channel);
                closed = true;
                controller.close();
              }
            } catch {
              // Invalid JSON, continue
            }
          }
        });

        // Heartbeat every 30 seconds
        const heartbeatInterval = setInterval(() => {
          if (closed) {
            clearInterval(heartbeatInterval);
            return;
          }
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        }, 30_000);

        // Cleanup on abort
        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeatInterval);
          publisher.unsubscribe(channel);
          closed = true;
          controller.close();
        });
      },
    });

    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("SSE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
