import * as vscode from "vscode";
import * as path from "path";

export interface Config {
  host: string;
  remotePath: string;
  localDirectory: string;
  syncOnSave: boolean;
  remoteCheckIntervalSeconds: number;
  conflictAction: "ask" | "local" | "remote";
  exclude: string[];
}

export function getConfig(): Config {
  const c = vscode.workspace.getConfiguration("remoteRsync");
  return {
    host: c.get("host", "remote-board"),
    remotePath: c.get("remotePath", "/opt/myapp"),
    localDirectory: c.get("localDirectory", ".remote-rsync"),
    syncOnSave: c.get("syncOnSave", true),
    remoteCheckIntervalSeconds: c.get("remoteCheckIntervalSeconds", 10),
    conflictAction: c.get("conflictAction", "ask"),
    exclude: c.get("exclude", []),
  };
}

export function mirrorPath(): string {
  const f = vscode.workspace.workspaceFolders?.[0];
  if (!f) throw new Error("No workspace is open.");
  return path.resolve(f.uri.fsPath, getConfig().localDirectory);
}
