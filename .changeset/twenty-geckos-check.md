---
"@i-santos/ship": patch
---

Fix beta release npm validation so no-op publishes do not wait for npm propagation when the expected stable version is already present without a `beta` dist-tag.
