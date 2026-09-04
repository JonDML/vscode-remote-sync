import * as vscode from "vscode";
import * as path from "path";
import { getConfig, mirrorPath } from "./config";
import { push } from "./sync";

export function registerWatcher(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
) {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (d) => {
      if (!getConfig().syncOnSave || d.uri.scheme !== "file") return;
      const root = path.resolve(mirrorPath()) + path.sep;
      if (!path.resolve(d.uri.fsPath).startsWith(root)) return;
      try {
        await push();
        vscode.window.setStatusBarMessage("Remote Rsync: pushed", 1500);
      } catch (e) {
        output.appendLine(String(e));
        vscode.window.showErrorMessage(`Remote Rsync push failed: ${String(e)}`);
      }
    }),
  );
}
