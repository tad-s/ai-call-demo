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

  // ローカル環境ではサーバーから公開URL（ngrok等）を取得して使用
  // Railway等クラウド環境ではserverUrl自体が公開URLなのでそのまま使用
  let twimlBaseUrl = serverUrl;
  if (serverUrl.includes("localhost")) {
    try {
      const res = await fetch(`${serverUrl}/public-url`);
      if (res.ok) {
        const data = await res.json();
        if (data.publicUrl) twimlBaseUrl = data.publicUrl;
      }
    } catch {
      // fallback to serverUrl
    }
  }

  try {
    const call = await client.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER!,
      url: `${twimlBaseUrl}/twiml`,
    });
    return NextResponse.json({ sid: call.sid });
  } catch (e: any) {
    return NextResponse.json({ message: e.message }, { status: 500 });
  }
}
