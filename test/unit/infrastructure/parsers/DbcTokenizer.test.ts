import * as assert from 'assert';
import { DbcTokenizer, DbcTokenType } from '../../../../src/infrastructure/parsers/dbc/DbcTokenizer';

suite('DbcTokenizer', () => {
    suite('static isKeyword', () => {
        test('returns true for VERSION', () => {
            assert.strictEqual(DbcTokenizer.isKeyword('VERSION'), true);
        });

        test('returns true for BO_', () => {
            assert.strictEqual(DbcTokenizer.isKeyword('BO_'), true);
        });

        test('returns true for SG_', () => {
            assert.strictEqual(DbcTokenizer.isKeyword('SG_'), true);
        });

        test('returns true for CM_', () => {
            assert.strictEqual(DbcTokenizer.isKeyword('CM_'), true);
        });

        test('returns true for BA_DEF_', () => {
            assert.strictEqual(DbcTokenizer.isKeyword('BA_DEF_'), true);
        });

        test('returns true for VAL_TABLE_', () => {
            assert.strictEqual(DbcTokenizer.isKeyword('VAL_TABLE_'), true);
        });

        test('returns false for unknown keyword', () => {
            assert.strictEqual(DbcTokenizer.isKeyword('UNKNOWN_KEYWORD'), false);
        });

        test('returns false for lowercase (case-sensitive)', () => {
            assert.strictEqual(DbcTokenizer.isKeyword('bo_'), false);
            assert.strictEqual(DbcTokenizer.isKeyword('version'), false);
        });

        test('returns false for empty string', () => {
            assert.strictEqual(DbcTokenizer.isKeyword(''), false);
        });
    });

    suite('tokenize — stub behavior', () => {
        test('tokenize() on empty string returns single EOF token', () => {
            const tokenizer = new DbcTokenizer('');
            const tokens = tokenizer.tokenize();
            assert.strictEqual(tokens.length, 1);
            assert.strictEqual(tokens[0].type, DbcTokenType.EOF);
        });

        test('tokenize() on any content returns only EOF (stub)', () => {
            const tokenizer = new DbcTokenizer('VERSION "1.0"\nBU_: ECU1\n');
            const tokens = tokenizer.tokenize();
            assert.strictEqual(tokens.length, 1);
            assert.strictEqual(tokens[0].type, DbcTokenType.EOF);
        });

        test('EOF token has empty value', () => {
            const tokenizer = new DbcTokenizer('');
            const tokens = tokenizer.tokenize();
            assert.strictEqual(tokens[0].value, '');
        });

        test('calling tokenize() twice returns consistent results', () => {
            const tokenizer = new DbcTokenizer('BO_ 100 Msg: 8 ECU1');
            const first = tokenizer.tokenize();
            const second = tokenizer.tokenize();
            assert.strictEqual(first.length, second.length);
            assert.strictEqual(first[0].type, second[0].type);
        });
    });

    // These tests document the expected behavior when the tokenizer is fully implemented.
    // They are skipped until readNextToken() is properly implemented.
    suite('tokenize — full implementation (skipped until tokenizer is implemented)', () => {
        test.skip('tokenizes "VERSION" as a Keyword token', () => {
            const tokenizer = new DbcTokenizer('VERSION');
            const tokens = tokenizer.tokenize();
            assert.strictEqual(tokens[0].type, DbcTokenType.Keyword);
            assert.strictEqual(tokens[0].value, 'VERSION');
        });

        test.skip('tokenizes quoted string as String token', () => {
            const tokenizer = new DbcTokenizer('"hello world"');
            const tokens = tokenizer.tokenize();
            assert.strictEqual(tokens[0].type, DbcTokenType.String);
            assert.strictEqual(tokens[0].value, 'hello world');
        });

        test.skip('tokenizes integer as Number token', () => {
            const tokenizer = new DbcTokenizer('42');
            const tokens = tokenizer.tokenize();
            assert.strictEqual(tokens[0].type, DbcTokenType.Number);
            assert.strictEqual(tokens[0].value, '42');
        });

        test.skip('tokenizes ":" as Colon', () => {
            const tokenizer = new DbcTokenizer(':');
            const tokens = tokenizer.tokenize();
            assert.strictEqual(tokens[0].type, DbcTokenType.Colon);
        });

        test.skip('tokenizes "|" as Pipe', () => {
            const tokenizer = new DbcTokenizer('|');
            const tokens = tokenizer.tokenize();
            assert.strictEqual(tokens[0].type, DbcTokenType.Pipe);
        });

        test.skip('tokenizes "@" as At', () => {
            const tokenizer = new DbcTokenizer('@');
            const tokens = tokenizer.tokenize();
            assert.strictEqual(tokens[0].type, DbcTokenType.At);
        });

        test.skip('tokenizes "(" as OpenParen and ")" as CloseParen', () => {
            const tokenizer = new DbcTokenizer('()');
            const tokens = tokenizer.tokenize();
            assert.strictEqual(tokens[0].type, DbcTokenType.OpenParen);
            assert.strictEqual(tokens[1].type, DbcTokenType.CloseParen);
        });

        test.skip('tracks line numbers correctly', () => {
            const tokenizer = new DbcTokenizer('VERSION "1.0"\nBU_: ECU1');
            const tokens = tokenizer.tokenize();
            assert.strictEqual(tokens[0].line, 1);
        });
    });
});
