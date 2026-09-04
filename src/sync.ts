import * as cp from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import * as vscode from "vscode";
import { getConfig, mirrorPath } from "./config";
import { sshExec } from "./ssh";

export interface FileState {
  hash: string;
  mtimeMs: number;
  size: number;
  exists: boolean;
}

export type StateMap = Record<string, FileState>;

const stateFile = () => path.join(mirrorPath(), ".remote-rsync-state.json");

function excluded(rel: string) {
  return getConfig().exclude.some((p) => {
    const x = p.replace(/\/$/, "");
    if (p.startsWith("*.")) return rel.endsWith(p.slice(1));
    return rel === x || rel.startsWith(x + "/") || rel.startsWith(x + path.sep);
  });
}

async function walk(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(base, full).split(path.sep).join("/");
    if (excluded(rel)) continue;
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

async function hash(f: string) {
  const h = crypto.createHash("sha256");
  h.update(await fs.readFile(f));
  return h.digest("hex");
}

async function localStates(): Promise<StateMap> {
  const root = mirrorPath(),
    m: StateMap = {};
  for (const rel of await walk(root)) {
    const f = path.join(root, rel),
      s = await fs.stat(f);
    m[rel] = {
      hash: await hash(f),
      mtimeMs: s.mtimeMs,
      size: s.size,
      exists: true,
    };
  }
  return m;
}

async function loadState(): Promise<StateMap> {
  try {
    return JSON.parse(await fs.readFile(stateFile(), "utf8"));
  } catch {
    return {};
  }
}

async function saveState(s: StateMap) {
  await fs.writeFile(stateFile(), JSON.stringify(s, null, 2));
}

function q(s: string) {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

async function remoteManifest(): Promise<StateMap> {
  const c = getConfig();
  const r = await sshExec(
    `cd ${q(c.remotePath)} && find . -type f -print0 | while IFS= read -r -d '' f; do sha256sum "$f" 2>/dev/null || true; done`,
  );
  if (r.code !== 0) throw new Error(r.stderr || `ssh exited ${r.code}`);
  const m: StateMap = {};
  for (const line of r.stdout.split(/\r?\n/)) {
    const x = line.match(/^([0-9a-f]{64})\s+\*?(?:\.\/)?(.+)$/);
    if (x) m[x[2]] = { hash: x[1], mtimeMs: 0, size: 0, exists: true };
  }
  return m;
}

export async function pull() {
  const c = getConfig(),
    root = mirrorPath();
  await fs.mkdir(root, { recursive: true });
  const command = `cd ${q(c.remotePath)} && tar -cf - .`;
  await new Promise<void>((resolve, reject) => {
    const ssh = cp.spawn("ssh", [c.host, command]);
    const tar = cp.spawn("tar", ["-xf", "-", "-C", root]);
    let err = "";
    ssh.stdout.pipe(tar.stdin);
    ssh.stderr.on("data", (d) => (err += d));
    tar.stderr.on("data", (d) => (err += d));
    ssh.on("error", reject);
    tar.on("error", reject);
    tar.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(err || `tar exited ${code}`)),
    );
  });
  await saveState(await localStates());
}

export async function push() {
  const c = getConfig(),
    root = mirrorPath(),
    args = ["-C", root, "--exclude=.remote-rsync-state.json"];
  for (const p of c.exclude) args.push("--exclude", p);
  args.push("-cf", "-", ".");
  await new Promise<void>((resolve, reject) => {
    const tar = cp.spawn("tar", args),
      ssh = cp.spawn("ssh", [
        c.host,
        `mkdir -p ${q(c.remotePath)} && cd ${q(c.remotePath)} && tar -xf -`,
      ]);
    let err = "";
    tar.stderr.on("data", (d) => (err += d));
    ssh.stderr.on("data", (d) => (err += d));
    tar.stdout.pipe(ssh.stdin);
    tar.on("error", reject);
    ssh.on("error", reject);
    ssh.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(err || `ssh exited ${code}`)),
    );
  });
  await saveState(await localStates());
}

export async function checkRemote() {
  const old = await loadState(),
    local = await localStates(),
    remote = await remoteManifest();
  const keys = new Set([
    ...Object.keys(old),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);
  const changed: string[] = [],
    conflicts: string[] = [],
    added: string[] = [],
    deleted: string[] = [];
  for (const k of keys) {
    if (excluded(k)) continue;
    const b = old[k]?.hash,
      l = local[k]?.hash,
      r = remote[k]?.hash,
      lc = b !== undefined ? l !== b : l !== undefined,
      rc = b !== undefined ? r !== b : r !== undefined;
    if (lc && rc && l !== r) conflicts.push(k);
    else if (rc && !lc) changed.push(k);
    else if (lc && !rc) changed.push(k);
    else if (!l && r) added.push(k);
    else if (l && !r) deleted.push(k);
  }
  return { changed, conflicts, added, deleted };
}

export async function syncInteractive(output: vscode.OutputChannel) {
  const d = await checkRemote();
  output.appendLine(JSON.stringify(d, null, 2));
  if (d.conflicts.length) {
    const def = getConfig().conflictAction;
    const a =
      def === "ask"
        ? await vscode.window.showQuickPick(
            ["Keep Local", "Keep Remote", "Cancel"],
            { placeHolder: `Conflicts: ${d.conflicts.length}` },
          )
        : def === "local"
          ? "Keep Local"
          : "Keep Remote";
    if (a === "Keep Local") await push();
    else if (a === "Keep Remote") await pull();
    return;
  }
  if (d.changed.length || d.added.length || d.deleted.length) {
    const a = await vscode.window.showQuickPick(
      ["Pull Remote → Local", "Push Local → Remote", "Cancel"],
      { placeHolder: "Changes detected" },
    );
    if (a === "Pull Remote → Local") await pull();
    else if (a === "Push Local → Remote") await push();
  } else
    vscode.window.showInformationMessage("Remote Rsync: no changes detected.");
}
