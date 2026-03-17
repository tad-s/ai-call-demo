import { NextResponse } from "next/server";
import twilio from "twilio";

export async function POST(req: Request) {
  const { to } = await req.json();
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  const serverUrl =
    process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:8081";

  const call = await client.calls.create({
    to,
    from: process.env.TWILIO_PHONE_NUMBER!,
    url: `${serverUrl}/twiml`,
  });

  return NextResponse.json({ sid: call.sid });
}
