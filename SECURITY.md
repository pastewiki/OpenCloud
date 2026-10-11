# Security policy

## Reporting a vulnerability

Please do not open a public issue for security problems. Report them privately to the
maintainers (add a contact address or enable GitHub private vulnerability reporting before
publishing this project).

If you accidentally exposed a Roblox Open Cloud API key, revoke or regenerate it immediately in
[Creator Dashboard → Credentials](https://create.roblox.com/dashboard/credentials). Rotating the
key is the only reliable fix; deleting a commit does not remove the key from forks or caches.

## Scope

This SDK is designed for trusted server-side environments. Using it in browsers or other
client-side contexts exposes credentials and is unsupported.
