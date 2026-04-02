# Architecture documentation (deep dive)

This folder breaks down the **candb-studio** extension host (`src/`) in smaller, navigable pieces. Start here, then read the numbered guides in order.

| Doc | Contents |
|-----|----------|
| [01-overview.md](01-overview.md) | High-level components, layers, how they connect |
| [02-extension-entry.md](02-extension-entry.md) | `extension.ts`: activation order, subscriptions, bus wiring |
| [03-application-layer.md](03-application-layer.md) | `CanDatabaseService`, validation, monitor, transmit |
| [04-domain-infrastructure.md](04-domain-infrastructure.md) | Domain models, parsers, repository, codecs, adapters |
| [05-presentation-layer.md](05-presentation-layer.md) | Custom editor, webview handler, tree, commands, providers |

The authoritative **short** overview (data flow, signal pool) remains in [../ARCHITECTURE.md](../ARCHITECTURE.md).
