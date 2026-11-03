# 09C3b MCP relations and forks

The local candidate adds v2 save/load and fork to the existing six tools. New write requests are bounded by the actual serialized UTF-8 bytes; v2 reads have their own bounded response. The adapter checks closed response shapes, dependencies, origin and credentials before returning data. Unknown writes require explicit same-key recovery; any write-side 500 remains unknown. Default initialization remains 1.7; v2 and fork need explicitly migrated 1.8 and 1.9 respectively.

Returned content is untrusted and enters the host. Saving or forking is not human confirmation. This is not a production installation, real model run or product acceptance.
