import { NextResponse } from "next/server";
import {
  buildSensitivityResponse,
  sensitivityRequestSchema,
  type SensitivityRequestPayload,
} from "./simulation";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload: SensitivityRequestPayload = sensitivityRequestSchema.parse(json);
    return NextResponse.json(buildSensitivityResponse(payload));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid sensitivity request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
