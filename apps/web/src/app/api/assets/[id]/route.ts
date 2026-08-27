import { auth } from "@/auth";
import { getSignedAssetUrl } from "@/server/assets";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const assetId = params.id;
    const signedUrl = await getSignedAssetUrl(assetId, session.user.id);

    return NextResponse.redirect(signedUrl);
  } catch (error) {
    if ((error as Error).message === "Asset not found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if ((error as Error).message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("Asset access error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
