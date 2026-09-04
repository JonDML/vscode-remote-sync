import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { getConfig } from "./config";
import { pull, push, checkRemote, syncInteractive } from "./sync";
import { registerWatcher } from "./watcher";

const output = vscode.window.createOutputChannel("Remote Rsync");

async function openRemoteFolder() {
  const c = getConfig();

  const host = await vscode.window.showInputBox({
    prompt: "SSH host or ~/.ssh/config alias",
    value: c.host,
  });

  if (!host) return;

  const remotePath = await vscode.window.showInputBox({
    prompt: "Remote folder",
    value: c.remotePath,
  });

  if (!remotePath) return;

  const p = await vscode.window.showOpenDialog({
    canSelectFolders: true,
    canSelectFiles: false,
    openLabel: "Select local parent folder",
  });

  if (!p?.[0]) return;

  const local = path.join(p[0].fsPath, ".remote-rsync");

  await fs.mkdir(local, { recursive: true });

  await vscode.workspace
    .getConfiguration("remoteRsync")
    .update("host", host, vscode.ConfigurationTarget.Workspace);

  await vscode.workspace
    .getConfiguration("remoteRsync")
    .update("remotePath", remotePath, vscode.ConfigurationTarget.Workspace);

  try {
    output.show(true);
    await pull();
    await vscode.commands.executeCommand(
      "vscode.openFolder",
      vscode.Uri.file(local),
      false,
    );
  } catch (e) {
    output.appendLine(String(e));
    vscode.window.showErrorMessage(`Remote Rsync pull failed: ${String(e)}`);
  }
}

async function doPull() {
  try {
    output.show(true);
    await pull();
    vscode.window.showInformationMessage("Remote Rsync: pull complete.");
  } catch (e) {
    output.appendLine(String(e));
    vscode.window.showErrorMessage(String(e));
  }
}

async function doPush() {
  try {
    output.show(true);
    await push();
    vscode.window.showInformationMessage("Remote Rsync: push complete.");
  } catch (e) {
    output.appendLine(String(e));
    vscode.window.showErrorMessage(String(e));
  }
}

async function doSync() {
  try {
    output.show(true);
    await syncInteractive(output);
  } catch (e) {
    output.appendLine(String(e));
    vscode.window.showErrorMessage(String(e));
  }
}

async function doCheck() {
  try {
    output.show(true);
    const r = await checkRemote();
    output.appendLine(JSON.stringify(r, null, 2));
    vscode.window.showInformationMessage(
      r.conflicts.length
        ? `${r.conflicts.length} conflict(s) detected.`
        : r.changed.length + r.added.length + r.deleted.length
          ? "Changes detected."
          : "No changes detected.",
    );
  } catch (e) {
    output.appendLine(String(e));
    vscode.window.showErrorMessage(String(e));
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "remoteRsync.openRemoteFolder",
      openRemoteFolder,
    ),
    vscode.commands.registerCommand("remoteRsync.pullNow", doPull),
    vscode.commands.registerCommand("remoteRsync.pushNow", doPush),
    vscode.commands.registerCommand("remoteRsync.syncNow", doSync),
    vscode.commands.registerCommand("remoteRsync.checkRemote", doCheck),
    output,
  );
  registerWatcher(context, output);
}

export function deactivate() {}
