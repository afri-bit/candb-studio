import type { ICanDatabaseParser } from '../../core/interfaces/database/ICanDatabaseParser';
import type { ICanDatabaseSerializer } from '../../core/interfaces/database/ICanDatabaseSerializer';
import { DbcParser } from './dbc/DbcParser';
import { DbcSerializer } from './dbc/DbcSerializer';

/**
 * Factory for selecting the correct parser/serializer based on file extension.
 * Strategy pattern: register new formats without touching existing code.
 */
export class ParserFactory {
  private static readonly parsers: Map<string, () => ICanDatabaseParser> = new Map();
  private static readonly serializers: Map<string, () => ICanDatabaseSerializer> = new Map();

  static {
    ParserFactory.parsers.set('.dbc', () => new DbcParser());
    ParserFactory.serializers.set('.dbc', () => new DbcSerializer());
  }

  /** Get a parser for the given file extension (e.g., '.dbc'). Throws if unsupported. */
  static getParser(extension: string): ICanDatabaseParser {
    const factory = ParserFactory.parsers.get(extension.toLowerCase());
    if (!factory) {
      throw new Error(`No parser registered for extension: ${extension}`);
    }
    return factory();
  }

  /** Get a serializer for the given file extension. Throws if unsupported. */
  static getSerializer(extension: string): ICanDatabaseSerializer {
    const factory = ParserFactory.serializers.get(extension.toLowerCase());
    if (!factory) {
      throw new Error(`No serializer registered for extension: ${extension}`);
    }
    return factory();
  }

  /** Register a custom parser for a file extension. */
  static registerParser(extension: string, factory: () => ICanDatabaseParser): void {
    ParserFactory.parsers.set(extension.toLowerCase(), factory);
  }

  /** Register a custom serializer for a file extension. */
  static registerSerializer(extension: string, factory: () => ICanDatabaseSerializer): void {
    ParserFactory.serializers.set(extension.toLowerCase(), factory);
  }

  /** All currently registered file extensions for parsing. */
  static getSupportedExtensions(): string[] {
    return Array.from(ParserFactory.parsers.keys());
  }
}
