# Security

## Reporting Vulnerabilities

If you discover a security vulnerability, please email **contact@terronex.dev** instead of opening a public issue. We will respond within 48 hours.

## Security Model

### Data Storage

- All memories are stored in local `.engram` files. No data is sent to external servers unless you configure a cloud LLM provider.
- Config files are stored in `~/.allo/config.json`. API keys in this file should be protected with appropriate file permissions (`chmod 600`).
- Allo creates `~/.allo/` on first run. Ensure this directory has `700` permissions.

### Encryption

- Allo supports AES-256-GCM encryption with argon2id key derivation (64MB memory, 3 iterations) for `.engram` files. Falls back to PBKDF2 (100,000 iterations, SHA-256) if argon2 is not available.
- Pass a `password` option when creating an Allo instance to enable encryption.
- Encryption is optional and off by default.

### Embeddings

- Default embedding model (Xenova/all-MiniLM-L6-v2) runs locally. No data leaves your machine.
- Ollama embeddings also run locally.
- Cloud LLM providers (Anthropic, OpenAI, Google) will receive memory content during chat and consolidation. Use local providers if privacy is a concern.

### API Keys

- API keys are stored in `~/.allo/config.json`. This file is not committed to git.
- Anthropic OAuth tokens are auto-detected and stored the same way.
- Keys are never logged or printed to stdout.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | Yes       |


## Important Notice

The encryption and key derivation implementations in this software have not been independently audited by a third-party security firm. While we follow established cryptographic standards (AES-256-GCM, argon2id, PBKDF2), users handling sensitive data should perform their own security assessment before relying on these protections in production.
