import { SignJWT } from "jose";

export async function generateJitsiToken(params: {
  room: string;
  userName: string;
  userEmail?: string;
  userId: string;
  isModerator: boolean;
  appId: string;
  appSecret: string;
}) {
  const secret = new TextEncoder().encode(params.appSecret);
  return new SignJWT({
    aud: "jitsi",
    iss: params.appId,
    sub: "meet.gecouncil.com",
    // Jitsi lowercases room names; a mixed-case claim would fail token validation
    room: params.room.toLowerCase(),
    context: {
      user: {
        name: params.userName,
        email: params.userEmail || `user${params.userId}@gecouncil.com`,
        id: params.userId,
        affiliation: params.isModerator ? "owner" : "member",
        lobby_bypass: params.isModerator,
      },
      features: {
        livestreaming: params.isModerator,
        recording: params.isModerator,
        transcription: params.isModerator,
        "outbound-call": params.isModerator,
      },
    },
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("6h")
    .sign(secret);
}
