// @workflow_state: REVIEW
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getCurrentNotificationSettings,
  saveCurrentNotificationSettings,
} from "@/lib/notifications/settings";

export const dynamic = "force-dynamic";

const settingsSchema = z.object({
  emailAddress: z.string().email().nullable(),
  notifyViaEmail: z.boolean(),
  notifyViaGithubIssue: z.boolean(),
});

export async function GET() {
  return NextResponse.json(await getCurrentNotificationSettings());
}

export async function POST(request: Request) {
  const payload = settingsSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
  }

  await saveCurrentNotificationSettings(payload.data);

  return NextResponse.json({ ok: true });
}
