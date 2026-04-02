import { CanDatabase } from '../../models/database/CanDatabase';

/**
 * Parses a raw file string into a {@link CanDatabase} domain model.
 *
 * Implementations are format-specific (e.g. DBC, KCD). The
 * {@link ParserFactory} selects the correct parser based on
 * file extension.
 */
export interface ICanDatabaseParser {
    /** File extensions this parser supports (e.g. `[".dbc"]`). */
    readonly supportedExtensions: string[];

    /** Parse file contents into a fully populated CanDatabase. */
    parse(content: string): CanDatabase;
}
