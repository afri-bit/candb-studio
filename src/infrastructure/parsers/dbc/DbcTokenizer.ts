/**
 * Token types produced by the DBC lexer.
 */
export enum DbcTokenType {
    Keyword = 'keyword',
    Identifier = 'identifier',
    Number = 'number',
    String = 'string',
    Colon = 'colon',
    Semicolon = 'semicolon',
    Pipe = 'pipe',
    At = 'at',
    Plus = 'plus',
    Minus = 'minus',
    OpenParen = 'open_paren',
    CloseParen = 'close_paren',
    OpenBracket = 'open_bracket',
    CloseBracket = 'close_bracket',
    Comma = 'comma',
    EOF = 'eof',
}

/** A single token produced by the DBC lexer. */
export interface DbcToken {
    type: DbcTokenType;
    value: string;
    line: number;
    column: number;
}

/** All keywords in the DBC grammar. */
const DBC_KEYWORDS = new Set([
    'VERSION',
    'NS_',
    'BS_',
    'BU_',
    'BO_',
    'SG_',
    'CM_',
    'BA_DEF_',
    'BA_DEF_DEF_',
    'BA_',
    'VAL_',
    'VAL_TABLE_',
    'SIG_GROUP_',
    'EV_',
    'ENVVAR_DATA_',
    'SG_MUL_VAL_',
    'BO_TX_BU_',
    'BA_REL_',
    'BA_SGTYPE_',
    'BA_DEF_SGTYPE_',
    'SIG_VALTYPE_',
    'SIG_TYPE_REF_',
    'NS_DESC_',
    'SGTYPE_',
    'SGTYPE_VAL_',
]);

/**
 * Lexer for the DBC file format.
 * Produces a stream of typed tokens from raw DBC text.
 *
 * TODO: Implement full character-by-character tokenization to
 *       enable a proper recursive-descent parser.
 */
export class DbcTokenizer {
    private pos = 0;
    private line = 1;
    private column = 1;

    constructor(private readonly content: string) {}

    /** Tokenize the entire input and return all tokens. */
    tokenize(): DbcToken[] {
        const tokens: DbcToken[] = [];
        this.pos = 0;
        this.line = 1;
        this.column = 1;

        while (this.pos < this.content.length) {
            this.skipWhitespace();
            if (this.pos >= this.content.length) {
                break;
            }
            const token = this.readNextToken();
            if (token) {
                tokens.push(token);
            }
        }

        tokens.push({ type: DbcTokenType.EOF, value: '', line: this.line, column: this.column });
        return tokens;
    }

    private readNextToken(): DbcToken | null {
        // TODO: implement full tokenization (identifiers, strings, numbers, punctuation)
        this.pos = this.content.length;
        return null;
    }

    private skipWhitespace(): void {
        while (this.pos < this.content.length) {
            const ch = this.content[this.pos];
            if (ch === '\n') {
                this.line++;
                this.column = 1;
                this.pos++;
            } else if (ch === '\r' || ch === ' ' || ch === '\t') {
                this.column++;
                this.pos++;
            } else {
                break;
            }
        }
    }

    static isKeyword(value: string): boolean {
        return DBC_KEYWORDS.has(value);
    }
}
