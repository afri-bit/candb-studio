import { CanDatabase } from '../../models/database/CanDatabase';

/**
 * Serializes a {@link CanDatabase} domain model back into a file string.
 *
 * Implementations are format-specific (e.g. DBC, KCD).
 */
export interface ICanDatabaseSerializer {
  /** File extensions this serializer supports (e.g. `[".dbc"]`). */
  readonly supportedExtensions: string[];

  /** Serialize a CanDatabase into its file format string. */
  serialize(database: CanDatabase): string;
}
