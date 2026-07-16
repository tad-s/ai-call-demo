export async function GET() {
  const credentialsSet = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  );
  return Response.json({
    credentialsSet,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER || null,
  });
}
