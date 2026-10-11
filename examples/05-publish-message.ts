/**
 * Example 5: publish a message to live servers (MessagingService).
 * API key permission: universe-messaging-service:publish
 *
 * In your experience, subscribe with:
 *   MessagingService:SubscribeAsync("announcements", function(message) ... end)
 */
import { RobloxOpenCloud } from "@roblox-open-cloud/sdk";

const roblox = RobloxOpenCloud.fromEnv();

await roblox.messaging.publish({
  universeId: process.env.ROBLOX_UNIVERSE_ID!,
  topic: "announcements",
  // Messages are strings. Encode structured data here and JSONDecode it in Luau.
  message: JSON.stringify({ text: "Server restart in 5 minutes", severity: "info" }),
});
console.log("Published");
