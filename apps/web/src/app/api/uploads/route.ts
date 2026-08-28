import { auth } from "@/auth";
import { InvalidUploadError, MAX_UPLOAD_BYTES, storeUploadedImage } from "@/server/uploads";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "image file is required" }, { status: 400 });
  }
  // Checked before reading the body into memory, so an oversized upload is
  // rejected without being buffered.
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Image is larger than 15MB" }, { status: 413 });
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const asset = await storeUploadedImage(session.user.id, bytes);
    return NextResponse.json({ assetId: asset.id }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidUploadError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
