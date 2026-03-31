import { CanDatabase } from '../../models/database/CanDatabase';

/**
 * Persistence port for loading and saving CAN database files.
 *
 * The core layer declares this interface; infrastructure provides the
 * concrete implementation (e.g. filesystem-based).
 */
export interface ICanDatabaseRepository {
  /** Load and parse a CAN database from the given path. */
  load(path: string): Promise<CanDatabase>;

  /** Parse already-read file content (used by the custom editor; avoids a second disk read). */
  parseContent(content: string, fileExtension: string): CanDatabase;

  /** Serialize and save a CAN database to the given path. */
  save(path: string, database: CanDatabase): Promise<void>;

  /** Serialize a database to text without writing (used to sync the custom text editor buffer). */
  serializeContent(database: CanDatabase, fileExtension: string): string;

  /** Check whether a CAN database file exists at the path. */
  exists(path: string): Promise<boolean>;
}
