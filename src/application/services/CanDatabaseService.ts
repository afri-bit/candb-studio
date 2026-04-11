import * as path from 'path';
import * as vscode from 'vscode';
import { AttributeValueType } from '../../core/enums/AttributeValueType';
import { ByteOrder } from '../../core/enums/ByteOrder';
import { MultiplexIndicator } from '../../core/enums/MultiplexIndicator';
import { ObjectType } from '../../core/enums/ObjectType';
import { SignalValueType } from '../../core/enums/SignalValueType';
import type { ICanDatabaseRepository } from '../../core/interfaces/database/ICanDatabaseRepository';
import type { IValidationService } from '../../core/interfaces/database/IValidationService';
import { AttributeDefinition } from '../../core/models/database/AttributeDefinition';
import type { CanDatabase } from '../../core/models/database/CanDatabase';
import type { Message } from '../../core/models/database/Message';
import { Node } from '../../core/models/database/Node';
import { Signal } from '../../core/models/database/Signal';
import { ValueTable } from '../../core/models/database/ValueTable';
import type { DiagnosticItem } from '../../core/types';
import {
    patchAttributeDefinition,
    webviewSignalToSignal,
    type WebviewSignalInput,
} from '../../presentation/webview/webviewDescriptorsToDomain';
import { EventBus } from '../../shared/events/EventBus';
import { MAX_CAN_DLC, MAX_CAN_FD_DLC } from '../../shared/constants';
import { Logger } from '../../shared/utils/Logger';

/**
 * Main orchestrator for CAN database operations.
 * Coordinates loading, saving, editing, and validation of CAN database files.
 *
 * Multiple `.dbc` buffers may be open; each is keyed by `TextDocument.uri.toString()`.
 */
export class CanDatabaseService {
    private readonly sessions = new Map<string, CanDatabase>();
    /** Last URI passed to `load` / `loadFromTextDocument` (fallback for commands). */
    private lastUri: string | null = null;
    /**
     * Which loaded `.dbc` session decodes bus traffic. Set on each load, and when
     * the user picks another session (Signal Lab). `null` means decode is unlinked (raw frames only).
     */
    private activeBusDatabaseUri: string | null = null;

    constructor(
        private readonly repository: ICanDatabaseRepository,
        private readonly validationService: IValidationService,
        private readonly eventBus: EventBus,
    ) {}

    /** Load a CAN database from the given file path. */
    async load(filePath: string): Promise<CanDatabase> {
        Logger.info(`Loading database from: ${filePath}`);
        const database = await this.repository.load(filePath);
        const uri = vscode.Uri.file(filePath).toString();
        this.sessions.set(uri, database);
        this.lastUri = uri;
        this.setActiveBusDatabaseUriInternal(uri);
        this.eventBus.emit('database:loaded', { database, uri });
        return database;
    }

    /**
     * Parse DBC from an open `TextDocument` (in-memory buffer).
     * Prefer this for the custom editor: avoids a second disk read.
     */
    loadFromTextDocument(document: vscode.TextDocument): CanDatabase {
        const content = document.getText();
        const ext =
            path.extname(document.uri.fsPath) ||
            path.extname(document.fileName) ||
            (document.languageId === 'dbc' ? '.dbc' : '');
        if (!ext) {
            throw new Error('Cannot determine file type for CAN database (expected .dbc)');
        }
        Logger.info(`Loading database from open document: ${document.uri.toString()}`);
        const database = this.repository.parseContent(content, ext);
        const uri = document.uri.toString();
        this.sessions.set(uri, database);
        this.lastUri = uri;
        this.setActiveBusDatabaseUriInternal(uri);
        this.eventBus.emit('database:loaded', { database, uri });
        return database;
    }

    /** Serialize the in-memory database for a document URI to DBC text (for syncing the editor buffer). */
    serializeDocument(uri: string): string {
        const db = this.requireDatabase(uri);
        return this.repository.serializeContent(db, '.dbc');
    }

    /** Save the database for the given document URI to its file path. */
    async save(uri?: string): Promise<void> {
        const key = uri ?? this.lastUri;
        if (!key) {
            throw new Error('No database loaded');
        }
        const db = this.sessions.get(key);
        if (!db) {
            throw new Error('No database loaded');
        }
        const fsPath = vscode.Uri.parse(key).fsPath;
        Logger.info(`Saving database to: ${fsPath}`);
        await this.repository.save(fsPath, db);
        this.eventBus.emit('database:saved', { uri: key });
    }

    /** Save the database to a different path and associate the session with that URI. */
    async saveAs(filePath: string): Promise<void> {
        const key = this.lastUri;
        if (!key) {
            throw new Error('No database loaded');
        }
        const db = this.sessions.get(key);
        if (!db) {
            throw new Error('No database loaded');
        }
        Logger.info(`Saving database as: ${filePath}`);
        await this.repository.save(filePath, db);
        const newUri = vscode.Uri.file(filePath).toString();
        this.sessions.delete(key);
        this.sessions.set(newUri, db);
        this.lastUri = newUri;
        if (this.activeBusDatabaseUri === key) {
            this.setActiveBusDatabaseUriInternal(newUri);
        }
        this.eventBus.emit('database:saved', { uri: newUri });
    }

    /** URIs of all in-memory DBC sessions (open buffers / loaded files). */
    getSessionUris(): string[] {
        return [...this.sessions.keys()].sort();
    }

    /** Which database is used for bus decode; mirrors the last loaded session until changed in Signal Lab. */
    getActiveBusDatabaseUri(): string | null {
        return this.activeBusDatabaseUri;
    }

    /**
     * Select which loaded `.dbc` decodes traffic on the bus.
     * Pass `null` to unlink decode and use raw frames only (sessions may remain open in the editor).
     */
    setActiveBusDatabaseUri(uri: string | null): void {
        if (uri !== null && !this.sessions.has(uri)) {
            throw new Error('Active bus database URI must refer to a loaded session');
        }
        this.setActiveBusDatabaseUriInternal(uri);
    }

    /** Database used for monitoring / transmit decode; follows {@link getActiveBusDatabaseUri}. */
    getDatabaseForBus(): CanDatabase | null {
        const u = this.activeBusDatabaseUri;
        return u ? (this.sessions.get(u) ?? null) : null;
    }

    private setActiveBusDatabaseUriInternal(uri: string | null): void {
        if (this.activeBusDatabaseUri === uri) {
            return;
        }
        this.activeBusDatabaseUri = uri;
        this.eventBus.emit('bus:activeDatabaseUriChanged', { uri });
    }

    /**
     * Return the database for an optional URI, else the active editor's document if loaded,
     * else the last loaded session.
     */
    getDatabase(uri?: string): CanDatabase | null {
        if (uri) {
            return this.sessions.get(uri) ?? null;
        }
        try {
            const active = vscode.window.activeTextEditor?.document.uri.toString();
            if (active && this.sessions.has(active)) {
                return this.sessions.get(active)!;
            }
        } catch {
            /* no window (tests) */
        }
        if (this.lastUri && this.sessions.has(this.lastUri)) {
            return this.sessions.get(this.lastUri)!;
        }
        return null;
    }

    /** Run all validation rules on the current database and return any findings. */
    validate(uri?: string): DiagnosticItem[] {
        const db = this.getDatabase(uri);
        if (!db) {
            return [];
        }
        return this.validationService.validate(db);
    }

    /** Add a message to the database for the given URI (or last loaded). */
    addMessage(message: Message, uri?: string): void {
        const u = uri ?? this.lastUri;
        if (!u) {
            throw new Error('No database loaded');
        }
        const db = this.requireDatabase(u);
        db.addMessage(message);
        this.eventBus.emit('database:changed', { database: db, uri: u });
    }

    removeMessage(id: number, uri?: string): boolean {
        const u = uri ?? this.lastUri;
        if (!u) {
            return false;
        }
        const db = this.sessions.get(u);
        if (!db) {
            return false;
        }
        const removed = db.removeMessage(id);
        if (removed) {
            this.eventBus.emit('database:changed', { database: db, uri: u });
        }
        return removed;
    }

    addNode(node: Node, uri?: string): void {
        const u = uri ?? this.lastUri;
        if (!u) {
            throw new Error('No database loaded');
        }
        const db = this.requireDatabase(u);
        db.addNode(node);
        this.eventBus.emit('database:changed', { database: db, uri: u });
    }

    removeNode(name: string, uri?: string): boolean {
        const u = uri ?? this.lastUri;
        if (!u) {
            return false;
        }
        const db = this.sessions.get(u);
        if (!db) {
            return false;
        }
        const removed = db.removeNode(name);
        if (removed) {
            this.eventBus.emit('database:changed', { database: db, uri: u });
        }
        return removed;
    }

    updateMessage(uri: string, messageId: number, changes: Record<string, unknown>): void {
        const db = this.requireDatabase(uri);
        const msg = db.findMessageById(messageId);
        if (!msg) {
            throw new Error(`Message id ${messageId} not found`);
        }
        if ('name' in changes && typeof changes.name === 'string') {
            msg.name = changes.name;
        }
        if ('id' in changes && typeof changes.id === 'number') {
            const nid = changes.id;
            if (nid !== msg.id && db.findMessageById(nid)) {
                throw new Error(`Message ID ${nid} already exists`);
            }
            msg.id = nid;
        }
        if ('isFd' in changes && typeof changes.isFd === 'boolean') {
            msg.isFd = changes.isFd;
        }
        if ('dlc' in changes && typeof changes.dlc === 'number') {
            const isFd = msg.isFd;
            const maxDlc = isFd ? MAX_CAN_FD_DLC : MAX_CAN_DLC;
            msg.dlc = Math.max(0, Math.min(maxDlc, Math.floor(changes.dlc)));
        }
        if ('transmitter' in changes && typeof changes.transmitter === 'string') {
            const name = changes.transmitter.trim();
            msg.transmittingNode = name;
            if (name && !db.findNodeByName(name)) {
                db.addNode(new Node(name));
            }
        }
        if ('comment' in changes && typeof changes.comment === 'string') {
            msg.comment = changes.comment;
        }
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    /**
     * Update signal: layout fields apply to this message's reference; other fields apply to the global pool.
     */
    updateSignal(
        uri: string,
        messageId: number,
        signalName: string,
        changes: Record<string, unknown>,
    ): void {
        const db = this.requireDatabase(uri);
        const msg = db.findMessageById(messageId);
        if (!msg) {
            throw new Error(`Message id ${messageId} not found`);
        }
        const ref = msg.findSignalRefByName(signalName);
        if (!ref) {
            throw new Error(`Signal "${signalName}" is not linked to this message`);
        }
        let poolSig = db.findPoolSignalByName(signalName);
        if (!poolSig) {
            throw new Error(`Signal "${signalName}" not found in pool`);
        }

        if ('startBit' in changes && typeof changes.startBit === 'number') {
            ref.startBit = Math.floor(changes.startBit);
        }
        if ('bitLength' in changes && typeof changes.bitLength === 'number') {
            ref.bitLength = Math.floor(changes.bitLength);
        }
        if ('byteOrder' in changes && typeof changes.byteOrder === 'string') {
            ref.byteOrder =
                changes.byteOrder === 'big_endian' ? ByteOrder.BigEndian : ByteOrder.LittleEndian;
        }

        const defChanges: Record<string, unknown> = { ...changes };
        delete defChanges.startBit;
        delete defChanges.bitLength;
        delete defChanges.byteOrder;

        if (Object.keys(defChanges).length === 0) {
            this.eventBus.emit('database:changed', { database: db, uri });
            return;
        }

        if ('name' in defChanges && typeof defChanges.name === 'string') {
            const nn = defChanges.name;
            if (nn !== signalName) {
                if (db.findPoolSignalByName(nn)) {
                    throw new Error(`Signal "${nn}" already exists in the pool`);
                }
                this.renamePoolSignalEverywhere(db, signalName, nn);
                poolSig = db.findPoolSignalByName(nn)!;
            }
            delete defChanges.name;
        }

        if (Object.keys(defChanges).length > 0) {
            this.applySignalChanges(poolSig, defChanges);
        }
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    /**
     * Link an existing pool signal to a message.
     * Bit length and byte order always come from the pool definition; optional `startBit` overrides placement for this frame only.
     */
    linkSignalToMessage(
        uri: string,
        messageId: number,
        signalName: string,
        options?: { startBit?: number },
    ): void {
        const db = this.requireDatabase(uri);
        const msg = db.findMessageById(messageId);
        if (!msg) {
            throw new Error(`Message id ${messageId} not found`);
        }
        const def = db.findPoolSignalByName(signalName);
        if (!def) {
            throw new Error(`Signal "${signalName}" is not in the pool`);
        }
        if (msg.findSignalRefByName(signalName)) {
            throw new Error(`Message already references "${signalName}"`);
        }
        const startBit =
            options?.startBit !== undefined ? Math.floor(options.startBit) : def.startBit;
        const signalEnd = startBit + def.bitLength;
        if (signalEnd > msg.dlc * 8) {
            throw new Error(
                `Signal "${def.name}" (bits ${startBit}–${signalEnd - 1}) exceeds message "${msg.name}" payload (${msg.dlc * 8} bits)`,
            );
        }
        msg.addSignalRef({
            signalName: def.name,
            startBit,
            bitLength: def.bitLength,
            byteOrder: def.byteOrder,
        });
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    /** Add a new signal definition to the global pool (unique name). */
    addPoolSignal(uri: string, input: WebviewSignalInput): void {
        const db = this.requireDatabase(uri);
        const signal = webviewSignalToSignal(input);
        db.addPoolSignal(signal);
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    /** Remove a signal from the pool only if it is not referenced by any message. */
    removePoolSignal(uri: string, signalName: string): void {
        const db = this.requireDatabase(uri);
        db.removePoolSignal(signalName);
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    addValueTable(
        uri: string,
        name: string,
        options?: { comment?: string; entries?: Record<string, string | number> },
    ): void {
        const db = this.requireDatabase(uri);
        const trimmed = name.trim();
        if (!trimmed) {
            throw new Error('Value table name is required');
        }
        const entries = new Map<number, string>();
        if (options?.entries) {
            for (const [k, v] of Object.entries(options.entries)) {
                entries.set(Number(k), String(v));
            }
        }
        const comment = options?.comment?.trim() || undefined;
        db.addValueTable(new ValueTable(trimmed, entries, comment));
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    updateValueTable(uri: string, name: string, changes: Record<string, unknown>): void {
        const db = this.requireDatabase(uri);
        const vt = db.findValueTableByName(name);
        if (!vt) {
            throw new Error(`Value table "${name}" not found`);
        }
        if ('name' in changes && typeof changes.name === 'string') {
            const nn = changes.name.trim();
            if (nn && nn !== name) {
                if (db.findValueTableByName(nn)) {
                    throw new Error(`Value table "${nn}" already exists`);
                }
                vt.name = nn;
                for (const s of db.signalPool) {
                    if (s.valueTableName === name) {
                        s.valueTableName = nn;
                    }
                }
            }
        }
        if (
            'entries' in changes &&
            changes.entries !== null &&
            typeof changes.entries === 'object'
        ) {
            vt.entries.clear();
            Object.entries(changes.entries as Record<string, string>).forEach(([k, v]) => {
                vt.entries.set(Number(k), v);
            });
        }
        if ('comment' in changes && typeof changes.comment === 'string') {
            vt.comment = changes.comment.trim() || undefined;
        }
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    removeValueTable(uri: string, name: string): void {
        const db = this.requireDatabase(uri);
        if (!db.removeValueTable(name)) {
            throw new Error(`Value table "${name}" not found`);
        }
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    updatePoolSignal(uri: string, signalName: string, changes: Record<string, unknown>): void {
        const db = this.requireDatabase(uri);
        let poolSig = db.findPoolSignalByName(signalName);
        if (!poolSig) {
            throw new Error(`Signal "${signalName}" not found in pool`);
        }
        if ('name' in changes && typeof changes.name === 'string') {
            const nn = changes.name;
            if (nn !== signalName) {
                if (db.findPoolSignalByName(nn)) {
                    throw new Error(`Signal "${nn}" already exists in the pool`);
                }
                this.renamePoolSignalEverywhere(db, signalName, nn);
            }
        }
        const afterName = typeof changes.name === 'string' ? changes.name : signalName;
        poolSig = db.findPoolSignalByName(afterName);
        if (!poolSig) {
            throw new Error(`Signal "${afterName}" not found in pool`);
        }
        const rest = { ...changes };
        delete rest.name;
        const layoutKeys = ['startBit', 'bitLength', 'byteOrder'] as const;
        const shouldSyncLayout = layoutKeys.some((k) => k in rest);
        if (Object.keys(rest).length > 0) {
            this.applySignalChanges(poolSig, rest);
        }
        if (shouldSyncLayout) {
            this.syncPoolLayoutToAllRefs(db, poolSig.name);
        }
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    /**
     * When the pool signal's layout fields change, push the same placement to every
     * message that references this signal so the pool editor and frames stay aligned.
     */
    private syncPoolLayoutToAllRefs(db: CanDatabase, signalName: string): void {
        const poolSig = db.findPoolSignalByName(signalName);
        if (!poolSig) {
            return;
        }
        for (const m of db.messages) {
            const r = m.findSignalRefByName(signalName);
            if (r) {
                r.startBit = poolSig.startBit;
                r.bitLength = poolSig.bitLength;
                r.byteOrder = poolSig.byteOrder;
            }
        }
    }

    /** Unlink a signal from a message (pool definition is kept). */
    removeSignal(uri: string, messageId: number, signalName: string): void {
        const db = this.requireDatabase(uri);
        const msg = db.findMessageById(messageId);
        if (!msg) {
            throw new Error(`Message id ${messageId} not found`);
        }
        if (!msg.removeSignalRef(signalName)) {
            throw new Error(`Signal "${signalName}" is not linked to this message`);
        }
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    duplicateSignalToMessage(
        uri: string,
        sourceMessageId: number,
        sourceSignalName: string,
        targetMessageId: number,
    ): void {
        const db = this.requireDatabase(uri);
        const srcMsg = db.findMessageById(sourceMessageId);
        if (!srcMsg) {
            throw new Error(`Message id ${sourceMessageId} not found`);
        }
        const srcResolved = srcMsg.findSignalByName(sourceSignalName, db.signalPool, db);
        if (!srcResolved) {
            throw new Error(`Signal "${sourceSignalName}" not found on source message`);
        }
        const tgtMsg = db.findMessageById(targetMessageId);
        if (!tgtMsg) {
            throw new Error(`Message id ${targetMessageId} not found`);
        }
        const newName = this.uniqueSignalNameInPool(db, srcResolved.name);
        db.addPoolSignal(this.cloneSignalWithNewName(srcResolved, newName));
        tgtMsg.addSignalRef({
            signalName: newName,
            startBit: srcResolved.startBit,
            bitLength: srcResolved.bitLength,
            byteOrder: srcResolved.byteOrder,
        });
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    private renamePoolSignalEverywhere(db: CanDatabase, oldName: string, newName: string): void {
        const s = db.findPoolSignalByName(oldName);
        if (!s) {
            throw new Error(`Signal "${oldName}" not in pool`);
        }
        s.name = newName;
        for (const m of db.messages) {
            const r = m.findSignalRefByName(oldName);
            if (r) {
                r.signalName = newName;
            }
        }
    }

    updateNode(uri: string, nodeName: string, changes: Record<string, unknown>): void {
        const db = this.requireDatabase(uri);
        const node = db.findNodeByName(nodeName);
        if (!node) {
            throw new Error(`Node "${nodeName}" not found`);
        }
        if ('name' in changes && typeof changes.name === 'string') {
            const newName = changes.name;
            if (newName !== node.name && db.findNodeByName(newName)) {
                throw new Error(`Node "${newName}" already exists`);
            }
            node.name = newName;
        }
        if ('comment' in changes && typeof changes.comment === 'string') {
            node.comment = changes.comment;
        }
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    updateAttributeDefinition(uri: string, index: number, changes: Record<string, unknown>): void {
        const db = this.requireDatabase(uri);
        const def = db.attributeDefinitions[index];
        if (!def) {
            throw new Error('Attribute definition not found');
        }
        patchAttributeDefinition(def, changes);
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    /** Append a new attribute definition (BA_DEF_) with a unique default name. */
    addAttributeDefinition(uri: string): void {
        const db = this.requireDatabase(uri);
        const name = this.uniqueAttributeDefinitionName(db);
        const def = new AttributeDefinition({
            name,
            objectType: ObjectType.Message,
            valueType: AttributeValueType.Integer,
            minimum: 0,
            maximum: 0,
            defaultValue: 0,
            comment: '',
        });
        db.addAttributeDefinition(def);
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    removeAttributeDefinition(uri: string, index: number): void {
        const db = this.requireDatabase(uri);
        if (!db.removeAttributeDefinitionAt(index)) {
            throw new Error('Attribute definition not found');
        }
        this.eventBus.emit('database:changed', { database: db, uri });
    }

    private uniqueAttributeDefinitionName(db: CanDatabase): string {
        const prefix = 'New_AttrDef_';
        for (let i = 0; i < 10_000; i++) {
            const candidate = `${prefix}${i}`;
            if (!db.findAttributeDefinition(candidate)) {
                return candidate;
            }
        }
        throw new Error('Could not allocate a unique attribute definition name');
    }

    private uniqueSignalNameInMessage(msg: Message, base: string): string {
        let name = base;
        let n = 1;
        while (msg.findSignalRefByName(name)) {
            name = `${base}_${n++}`;
        }
        return name;
    }

    private uniqueSignalNameInPool(db: CanDatabase, base: string): string {
        let name = base;
        let n = 1;
        while (db.findPoolSignalByName(name)) {
            name = `${base}_${n++}`;
        }
        return name;
    }

    private cloneSignalWithNewName(source: Signal, name: string): Signal {
        return new Signal({
            name,
            startBit: source.startBit,
            bitLength: source.bitLength,
            byteOrder: source.byteOrder,
            valueType: source.valueType,
            factor: source.factor,
            offset: source.offset,
            minimum: source.minimum,
            maximum: source.maximum,
            unit: source.unit,
            receivingNodes: [...source.receivingNodes],
            valueDescriptions: new Map(source.valueDescriptions),
            valueTableName: source.valueTableName,
            multiplexIndicator: source.multiplexIndicator,
            multiplexValue: source.multiplexValue,
            comment: source.comment,
        });
    }

    private applySignalChanges(signal: Signal, changes: Record<string, unknown>): void {
        if ('name' in changes && typeof changes.name === 'string') {
            signal.name = changes.name;
        }
        if ('startBit' in changes && typeof changes.startBit === 'number') {
            signal.startBit = Math.floor(changes.startBit);
        }
        if ('bitLength' in changes && typeof changes.bitLength === 'number') {
            signal.bitLength = Math.floor(changes.bitLength);
        }
        if ('byteOrder' in changes && typeof changes.byteOrder === 'string') {
            signal.byteOrder =
                changes.byteOrder === 'big_endian' ? ByteOrder.BigEndian : ByteOrder.LittleEndian;
        }
        if ('factor' in changes && typeof changes.factor === 'number') {
            signal.factor = changes.factor;
        }
        if ('offset' in changes && typeof changes.offset === 'number') {
            signal.offset = changes.offset;
        }
        if ('minimum' in changes && typeof changes.minimum === 'number') {
            signal.minimum = changes.minimum;
        }
        if ('maximum' in changes && typeof changes.maximum === 'number') {
            signal.maximum = changes.maximum;
        }
        if ('unit' in changes && typeof changes.unit === 'string') {
            signal.unit = changes.unit;
        }
        if ('comment' in changes && typeof changes.comment === 'string') {
            signal.comment = changes.comment;
        }
        if ('isSigned' in changes || 'valueType' in changes) {
            const vt = changes.valueType;
            const isSigned = changes.isSigned;
            if (vt === 'float') {
                signal.valueType = SignalValueType.IEEEFloat;
            } else if (vt === 'double') {
                signal.valueType = SignalValueType.IEEEDouble;
            } else if (typeof isSigned === 'boolean') {
                signal.valueType = isSigned ? SignalValueType.Signed : SignalValueType.Unsigned;
            }
        }
        if ('multiplex' in changes) {
            const m = changes.multiplex;
            if (m === 'multiplexor') {
                signal.multiplexIndicator = MultiplexIndicator.Multiplexor;
                signal.multiplexValue = undefined;
            } else if (m === 'none') {
                signal.multiplexIndicator = MultiplexIndicator.None;
                signal.multiplexValue = undefined;
            } else if (typeof m === 'number') {
                signal.multiplexIndicator = MultiplexIndicator.MultiplexedSignal;
                signal.multiplexValue = m;
            }
        }
        if ('valueTableName' in changes) {
            const v = changes.valueTableName;
            if (v === '' || v === null || v === undefined) {
                signal.valueTableName = undefined;
            } else if (typeof v === 'string') {
                signal.valueTableName = v;
            }
        }
        if (
            'valueDescriptions' in changes &&
            changes.valueDescriptions !== null &&
            typeof changes.valueDescriptions === 'object'
        ) {
            const vd = new Map<number, string>();
            Object.entries(changes.valueDescriptions as Record<string, string>).forEach(
                ([k, val]) => {
                    vd.set(Number(k), val);
                },
            );
            signal.valueDescriptions = vd;
        }
        if ('receivers' in changes) {
            const r = changes.receivers;
            if (Array.isArray(r)) {
                signal.receivingNodes = r.map((x) => String(x).trim()).filter(Boolean);
            } else if (typeof r === 'string') {
                signal.receivingNodes = r
                    .split(/[,\n]+/)
                    .map((s) => s.trim())
                    .filter(Boolean);
            }
        }
    }

    private requireDatabase(uri: string): CanDatabase {
        const db = this.sessions.get(uri);
        if (!db) {
            throw new Error('No database loaded for this document');
        }
        return db;
    }
}
