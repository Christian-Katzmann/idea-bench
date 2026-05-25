# Rejected: OAuth-Only Operator Login

OAuth-only login was attractive because it would attach every operator session to a real person and simplify AI-spend attribution, but it would make the self-hosted first run depend on GitHub or email-provider setup before the operator can even see the product. ïdea Bench keeps password login as the bootstrap path and offers GitHub OAuth and email magic links as optional stronger identities.

This should be reconsidered only if ïdea Bench becomes a hosted multi-tenant service where accountable per-user identity is required for every session.
