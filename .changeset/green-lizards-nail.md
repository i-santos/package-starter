---
"@i-santos/create-package-starter": patch
---

Adjust `setup-npm` first publish flow to use standard interactive npm publish behavior.

- Remove custom OTP flag handling.
- Delegate first publish directly to `npm publish --access public` with inherited stdio.
- Improve EOTP error guidance while keeping npm native interactive flow.
