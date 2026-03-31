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
      vscode.extensions.getExtension('undefined_publisher.vscode-canbus') ??
      vscode.extensions.all.find((e) => e.id.includes('vscode-canbus'));
    await ext?.activate();
  });

  suite('activation', () => {
    test('extension is present in the extension list', () => {
      const ext = vscode.extensions.getExtension('undefined_publisher.vscode-canbus');
      // During development the publisher may not be set; check for the extension name fallback.
      // TODO: Update publisher name once package.json is finalized.
      assert.ok(
        ext !== undefined || vscode.extensions.all.some(e => e.id.includes('vscode-canbus')),
        'Extension should be discoverable',
      );
    });
  });

  suite('commands', () => {
    test('vscode-canbus.openDatabase command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('vscode-canbus.openDatabase'),
        'openDatabase command should be registered',
      );
    });

    test('vscode-canbus.connectBus command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('vscode-canbus.connectBus'),
        'connectBus command should be registered',
      );
    });

    test('vscode-canbus.disconnectBus command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('vscode-canbus.disconnectBus'),
        'disconnectBus command should be registered',
      );
    });

    test('vscode-canbus.startMonitor command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('vscode-canbus.startMonitor'),
        'startMonitor command should be registered',
      );
    });

    test('vscode-canbus.stopMonitor command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('vscode-canbus.stopMonitor'),
        'stopMonitor command should be registered',
      );
    });

    test('vscode-canbus.openSignalLab command is registered', async () => {
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes('vscode-canbus.openSignalLab'),
        'openSignalLab command should be registered',
      );
    });
  });
});
