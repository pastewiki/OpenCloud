/**
 * Example 7: handle authentication and permission errors.
 */
import {
  ApiError,
  AuthenticationError,
  PermissionError,
  RobloxOpenCloud,
} from "@roblox-open-cloud/sdk";

const roblox = RobloxOpenCloud.fromEnv();

try {
  await roblox.messaging.publish({
    universeId: process.env.ROBLOX_UNIVERSE_ID!,
    topic: "test",
    message: "hello",
  });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error("The API key is invalid or expired. Rotate it in Creator Dashboard.");
  } else if (error instanceof PermissionError) {
    // Show Roblox's message: it distinguishes missing scopes from missing credentials.
    console.error(
      `Permission denied: ${error.message}\n` +
        "Check that the key has universe-messaging-service:publish, that this experience is " +
        "allowed, and that the key's IP allowlist (if any) includes this machine.",
    );
  } else if (error instanceof ApiError) {
    console.error("Open Cloud error", error.toJSON());
  } else {
    throw error;
  }
  process.exitCode = 1;
}
