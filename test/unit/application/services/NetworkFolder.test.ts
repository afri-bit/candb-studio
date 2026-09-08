import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { CanDatabaseService } from '../../../../src/application/services/CanDatabaseService';
import { DbcParser } from '../../../../src/infrastructure/parsers/dbc/DbcParser';
import { DbcSerializer } from '../../../../src/infrastructure/parsers/dbc/DbcSerializer';
import { EventBus } from '../../../../src/shared/events/EventBus';
import {
    readMessageSchedule,
    type MessageSchedule,
} from '../../../../src/core/models/database/messageSchedule';
import type { ICanDatabaseRepository } from '../../../../src/core/interfaces/database/ICanDatabaseRepository';

const content =
    'VERSION ""\nBO_ 1 Status: 8 ECU\n SG_ Switch M : 0|4@1+ (1,0) [0|15] "" ECU\n SG_ Value m0 : 8|8@1+ (1,0) [0|255] "" ECU\n';
suite('Network folder and per-message edits', () => {
    let folder: string;
    let service: CanDatabaseService;
    let uri: string;
    const schedule: MessageSchedule = {
        sendType: 'cyclic',
        cycleTimeMs: 10,
        sourceNetwork: 'a.dbc',
        forwardNetwork: 'b.dbc',
        forwardNode: 'GW',
        forwardRateMode: 'source',
        forwardFrequencyHz: 0,
    };
    setup(async () => {
        folder = await fs.mkdtemp(path.join(os.tmpdir(), 'candb-networks-'));
        await fs.writeFile(path.join(folder, 'a.dbc'), content);
        const repository: ICanDatabaseRepository = {
            load: async (file) => new DbcParser().parse(await fs.readFile(file, 'utf8')),
            parseContent: (text) => new DbcParser().parse(text),
            serializeContent: (db) => new DbcSerializer().serialize(db),
            save: async (file, db) => {
                await fs.writeFile(file, new DbcSerializer().serialize(db));
            },
            exists: async (file) =>
                fs.access(file).then(
                    () => true,
                    () => false,
                ),
        };
        service = new CanDatabaseService(repository, { validate: () => [] }, new EventBus());
        await service.load(path.join(folder, 'a.dbc'));
        uri = vscode.Uri.file(path.join(folder, 'a.dbc')).toString();
    });
    teardown(async () => {
        await fs.rm(folder, { recursive: true, force: true });
    });
    test('rejects forwarding without explicit folder selection and with only one DBC', async () => {
        assert.throws(() => service.updateMessage(uri, 1, { schedule }), /Select a folder/);
        await service.selectNetworkFolder(folder);
        assert.throws(() => service.updateMessage(uri, 1, { schedule }), /Select a folder/);
        assert.strictEqual(readMessageSchedule(service.getDatabase(uri)!, 1).sendType, '');
    });
    test('enables only destinations in a multi-DBC folder, refresh detects deletion and clear disables it', async () => {
        await fs.writeFile(path.join(folder, 'b.dbc'), content);
        await service.selectNetworkFolder(folder);
        assert.throws(
            () =>
                service.updateMessage(uri, 1, {
                    schedule: { ...schedule, forwardNetwork: 'outside.dbc' },
                }),
            /different destination/,
        );
        service.updateMessage(uri, 1, { schedule });
        const db = new DbcParser().parse(service.serializeDocument(uri));
        assert.deepStrictEqual(readMessageSchedule(db, 1), schedule);
        assert.strictEqual(
            service.getNetworkFolder().databases[0].database,
            service.getDatabase(uri),
        );
        await fs.unlink(path.join(folder, 'b.dbc'));
        await service.selectNetworkFolder(folder);
        assert.throws(
            () => service.updateMessage(uri, 1, { schedule: { ...schedule, forwardNode: 'GW2' } }),
            /Select a folder/,
        );
        await service.selectNetworkFolder(null);
        assert.strictEqual(service.getNetworkFolder().path, null);
    });
    test('CAN ID edits keep scheduling attributes attached', () => {
        service.updateMessage(uri, 1, { schedule: { ...schedule, forwardNetwork: '' } });
        service.updateMessage(uri, 1, { id: 2 });
        assert.strictEqual(readMessageSchedule(service.getDatabase(uri)!, 2).cycleTimeMs, 10);
    });
    test('multiplex editing applies to one frame and survives serialization', () => {
        service.updateSignal(uri, 1, 'Value', { multiplex: 3 });
        const db = new DbcParser().parse(service.serializeDocument(uri));
        assert.strictEqual(
            db.messages[0].findSignalByName('Value', db.signalPool, db)?.multiplexValue,
            3,
        );
        assert.throws(() => service.updateSignal(uri, 1, 'Value', { multiplex: -1 }));
        assert.throws(() => service.updateSignal(uri, 1, 'Value', { multiplex: 0.5 }));
    });
});
