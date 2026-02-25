# Contributing to Allo

Contributions are welcome. Here's how to get started.

## Development Setup

```bash
git clone https://github.com/Terronex-dev/allo.git
cd allo
npm install
```

### Run in development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Test

```bash
npm test
```

### Link locally

```bash
npm run build
npm link
allo
```

## Project Structure

```
src/
  allo.ts         Core class: memory operations, search, dedup
  cli.ts          CLI entry point, interactive menu, all commands
  theme.ts        Colors, formatting, branding
  providers.ts    LLM provider implementations (Anthropic, OpenAI, Gemini, Ollama)
  onboarding.ts   First-run setup wizard
  brains.ts       Brain discovery and switching
  index.ts        Library exports
tests/
  allo.test.ts    Core test suite
```

## Code Style

- TypeScript strict mode
- ES modules (NodeNext)
- Named exports only
- No default exports

## Pull Requests

1. Fork the repo
2. Create a branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Build (`npm run build`)
6. Commit with a descriptive message
7. Open a PR

## Dependencies

- `@terronex/engram` -- Memory format (must be on NPM)
- `@terronex/engram-trace-lite` -- Consolidation pipeline (must be on NPM)
- Local deps use `file:../` during development only; published packages use NPM versions

## License

By contributing, you agree your contributions are licensed under MIT.
