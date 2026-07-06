# Changelog

All notable changes to this project will be documented in this file.

## [0.6.3] - 2026-07-06

### Fixed
- **React Builder (`CordBuilder`)**: 
  - Replaced native `alert()` with a "Quiet Luxury" inline error state when trying to submit a quote without descriptions.
  - Replaced the generic emoji `✕` on the item deletion button with a clean SVG icon.
  - Improved the robustness of `useCordCatalog` and `useCordClients` to properly hit `/productos` and `/clientes` endpoints, avoiding fragile string replacement bugs.
- **Server (`CordWebhooks`)**:
  - Webhook signature parsing now correctly reads the `sha256=<hmac>` format sent by the Cord server.
  - Webhook verification now securely compares the signature hashes in constant time using `crypto.timingSafeEqual` to prevent timing attacks.
