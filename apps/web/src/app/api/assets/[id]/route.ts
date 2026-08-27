import { auth } from "@/auth";
import { AssetNotFoundError, getSignedAssetUrl } from "@/server/assets";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: assetId } = await params;

  try {
    const signedUrl = await getSignedAssetUrl(assetId, session.user.id);
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    if (error instanceof AssetNotFoundError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("Asset access error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
