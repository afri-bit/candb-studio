/**
 * Minimal `vscode` shim for running unit tests under Node + mocha.
 * Only implements APIs used by tests; extension host tests still use real VS Code.
 */
const Module = require('module');
const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') {
    return {
      Uri: {
        file: (/** @type {string} */ fsPath) => {
          const p = fsPath.replace(/\\/g, '/');
          const toString = () => {
            if (p.startsWith('/')) {
              return 'file://' + p;
            }
            return 'file:///' + p;
          };
          return { fsPath: fsPath.replace(/\\/g, '/'), scheme: 'file', toString };
        },
        parse: (/** @type {string} */ uriString) => {
          if (uriString.startsWith('file:///')) {
            return {
              fsPath: uriString.slice(7),
              scheme: 'file',
              toString: () => uriString,
            };
          }
          if (uriString.startsWith('file://')) {
            return {
              fsPath: uriString.slice(7),
              scheme: 'file',
              toString: () => uriString,
            };
          }
          return {
            fsPath: uriString,
            scheme: 'file',
            toString: () => uriString,
          };
        },
      },
    };
  }
  return origLoad.apply(this, arguments);
};
