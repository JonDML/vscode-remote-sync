import * as cp from "child_process";
import { getConfig } from "./config";

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function sshExec(command: string): Promise<ExecResult> {
  const c = getConfig();
  return new Promise((resolve, reject) => {
    const p = cp.spawn("ssh", [c.host, command], { shell: false });
    let stdout = "",
      stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}
