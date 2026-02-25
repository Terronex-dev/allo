# Security

## Reporting Vulnerabilities

If you discover a security vulnerability, please email **contact@terronex.dev** instead of opening a public issue. We will respond within 48 hours.

## Security Model

### Data Storage

- All memories are stored in local `.engram` files. No data is sent to external servers unless you configure a cloud LLM provider.
- Config files are stored in `~/.allo/config.json`. API keys in this file should be protected with appropriate file permissions (`chmod 600`).
- Allo creates `~/.allo/` on first run. Ensure this directory has `700` permissions.

### Encryption

- Allo supports AES-256-GCM encryption with Argon2id key derivation for `.engram` files.
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
