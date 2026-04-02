import * as assert from 'assert';
import * as vscode from 'vscode';

/**
 * Extension integration tests.
 * These run inside the VS Code extension host via @vscode/test-electron.
 */
suite('Extension Integration', () => {
  suiteSetup(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    const ext =
      vscode.extensions.getExtension('undefined_publisher.candb-studio') ??
      vscode.extensions.all.find((e) => e.id.includes('candb-studio'));
    await ext?.activate();
  });

  suite('activation', () => {
    test('extension is present in the extension list', () => {
      const ext = vscode.extensions.getExtension('undefined_publisher.candb-studio');
      // During development the publisher may not be set; check for the extension name fallback.
      // TODO: Update publisher name once package.json is finalized.
      assert.ok(
        ext !== undefined || vscode.extensions.all.some(e => e.id.includes('candb-studio')),
        'Extension should be discoverable',
      );
    });
  });

  suite('commands', () => {
    test('candb-studio.openDatabase command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('candb-studio.openDatabase'),
        'openDatabase command should be registered',
      );
    });

    test('candb-studio.connectBus command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('candb-studio.connectBus'),
        'connectBus command should be registered',
      );
    });

    test('candb-studio.disconnectBus command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('candb-studio.disconnectBus'),
        'disconnectBus command should be registered',
      );
    });

    test('candb-studio.startMonitor command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('candb-studio.startMonitor'),
        'startMonitor command should be registered',
      );
    });

    test('candb-studio.stopMonitor command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('candb-studio.stopMonitor'),
        'stopMonitor command should be registered',
      );
    });

    test('candb-studio.openSignalLab command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('candb-studio.openSignalLab'),
        'openSignalLab command should be registered',
      );
    });
  });
});
