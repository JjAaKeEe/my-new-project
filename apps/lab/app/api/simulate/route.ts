import { NextResponse } from "next/server";
import {
  buildSimulationResponse,
  simulateRequestSchema,
  type SimulateRequestPayload,
} from "./simulation";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload: SimulateRequestPayload = simulateRequestSchema.parse(json);

    return NextResponse.json(buildSimulationResponse(payload));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid simulation request";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
