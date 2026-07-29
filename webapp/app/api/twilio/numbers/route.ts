import twilioClient from "@/lib/twilio";
import { getSession, isAdmin } from "@/lib/auth";

export async function GET() {
  if (!twilioClient) {
    return Response.json(
      { error: "Twilio client not initialized" },
      { status: 500 }
    );
  }

  const incomingPhoneNumbers = await twilioClient.incomingPhoneNumbers.list({
    limit: 20,
  });
  return Response.json(incomingPhoneNumbers);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session.role)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!twilioClient) {
    return Response.json(
      { error: "Twilio client not initialized" },
      { status: 500 }
    );
  }

  const { phoneNumberSid, voiceUrl } = await req.json();
  const incomingPhoneNumber = await twilioClient
    .incomingPhoneNumbers(phoneNumberSid)
    .update({ voiceUrl });

  return Response.json(incomingPhoneNumber);
}
