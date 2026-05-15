// @workflow_state: REVIEW
import { NextResponse } from "next/server";
import {
  getCurrentUserProfile,
  saveCurrentUserProfile,
  userProfileInputSchema,
} from "@/lib/profile/userProfile";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getCurrentUserProfile());
}

export async function POST(request: Request) {
  const payload = userProfileInputSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid profile payload." }, { status: 400 });
  }

  try {
    await saveCurrentUserProfile(payload.data);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Profile save failed." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
