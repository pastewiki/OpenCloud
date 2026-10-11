# Integration tests

These tests call the real Roblox Open Cloud API. They never run by default, and
`npm test` (unit tests) never makes network calls.

## Safety

- Use a **dedicated test experience**, not a production game.
- Create a separate API key restricted to that experience, with only these permissions:
  - Read-only suite: `universe-datastores.control:list` (Data Stores → List data stores).
    `universes.get` does not list a required scope.
  - Write suite: also `universe-datastores.objects:create`, `:read`, `:update`,
    `:delete`, and `universe-datastores.versions:list`.
- The write suite only creates keys named `sdk-it-<uuid>` in `ROBLOX_TEST_DATA_STORE`
  and deletes them afterwards. Data store deletes are soft: Roblox removes them for
  good after 30 days.

## Running

```bash
export ROBLOX_OPEN_CLOUD_API_KEY=...        # from your secret store
export ROBLOX_UNIVERSE_ID=1234567890
export ROBLOX_INTEGRATION=1                 # read-only suite
export ROBLOX_INTEGRATION_WRITE=1           # optional write suite
export ROBLOX_TEST_DATA_STORE=sdk-integration-tests
npm run test:integration
```
