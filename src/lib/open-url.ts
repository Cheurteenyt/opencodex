import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

function windowsRundll32(): string {
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  const candidate = join(windowsRoot, "System32", "rundll32.exe");
  return existsSync(candidate) ? candidate : "rundll32";
}

function windowsCmdExe(): string {
  const windowsRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
  const candidate = join(windowsRoot, "System32", "cmd.exe");
  return existsSync(candidate) ? candidate : "cmd.exe";
}

/**
 * Open a URL in the system default browser.
 *
 * Windows: prefer `cmd /c start "" "<url>"`, which delegates to the shell's
 * registered URL handler reliably across terminals (including git-bash/MSYS,
 * where a bare `rundll32 url.dll,FileProtocolHandler` often fails silently).
 * Falls back to rundll32 if cmd is unavailable. A failure is logged rather than
 * swallowed so the caller (and the user) can see why the browser did not open.
 */
export function openUrl(url: string): void {
  if (!/^https?:\/\//i.test(url)) return;

  const platform = process.platform;
  let child;
  if (platform === "darwin") {
    child = spawn("open", [url], { detached: true, stdio: "ignore", shell: false });
  } else if (platform === "win32") {
    const cmd = windowsCmdExe();
    // `start` needs a quoted empty title and then the URL; quoting the URL
    // prevents spaces/& from breaking the command.
    child = spawn(cmd, ["/c", "start", "", url], { detached: true, stdio: "ignore", shell: false, windowsVerbatimArguments: true });
  } else {
    child = spawn("xdg-open", [url], { detached: true, stdio: "ignore", shell: false });
  }

  child.on("error", (err) => {
    // Last-resort fallback on Windows if `cmd /c start` somehow failed.
    if (platform === "win32" && (err as NodeJS.ErrnoException).code === "ENOENT") {
      try {
        const fb = spawn(windowsRundll32(), ["url.dll,FileProtocolHandler", url], {
          detached: true,
          stdio: "ignore",
          shell: false,
        });
        fb.on("error", () => {
          console.warn(`[opencodex] Could not open browser automatically. Open this URL manually: ${url}`);
        });
        fb.unref();
        return;
      } catch {
        /* fall through to warning below */
      }
    }
    console.warn(`[opencodex] Could not open browser automatically (${err.message}). Open this URL manually: ${url}`);
  });
  child.unref();
}
