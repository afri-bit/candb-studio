import * as vscode from 'vscode';
import * as path from 'path';
import type { ICanDatabaseRepository } from '../../core/interfaces/database/ICanDatabaseRepository';
import type { CanDatabase } from '../../core/models/database/CanDatabase';
import { ParserFactory } from '../parsers/ParserFactory';

/**
 * File-system-backed repository for loading and saving CAN database files.
 * Uses VS Code's workspace file system API and delegates parsing/serialization
 * to the appropriate format handler via ParserFactory.
 */
export class FileSystemRepository implements ICanDatabaseRepository {
  async load(filePath: string): Promise<CanDatabase> {
    const content = await this.readRaw(filePath);
    const ext = path.extname(filePath);
    return this.parseContent(content, ext);
  }

  parseContent(content: string, fileExtension: string): CanDatabase {
    const parser = ParserFactory.getParser(fileExtension);
    return parser.parse(content);
  }

  async save(filePath: string, database: CanDatabase): Promise<void> {
    const ext = path.extname(filePath);
    const content = this.serializeContent(database, ext);
    await this.writeRaw(filePath, content);
  }

  serializeContent(database: CanDatabase, fileExtension: string): string {
    const serializer = ParserFactory.getSerializer(fileExtension);
    return serializer.serialize(database);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const uri = vscode.Uri.file(filePath);
      await vscode.workspace.fs.stat(uri);
      return true;
    } catch {
      return false;
    }
  }

  private async readRaw(filePath: string): Promise<string> {
    const uri = vscode.Uri.file(filePath);
    const data = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(data).toString('utf-8');
  }

  private async writeRaw(filePath: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf-8'));
  }
}
