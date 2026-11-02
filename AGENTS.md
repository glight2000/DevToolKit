# Build output and cleanup

The user explicitly authorized the following workflow on 2026-10-10:

- Reuse `dist/win-unpacked` for local Windows packages. Do not create a new output directory for each change.
- When packaging requires it, terminate DevToolkit and DesktopHost processes whose executable paths are inside this project. No further prompt or manual-exit reminder is needed. Do not terminate unrelated processes.
- After a successful, verified package exists in `dist/win-unpacked`, remove obsolete version directories under this project's `dist` without asking again. The existing `desktop-fix`, `desktop-preview`, `modal-fix`, `ssh-config-preview`, and `ssh-workspace-preview` directories are explicitly approved for deletion.
- Before recursive cleanup, resolve and verify every target remains inside this project's `dist`. Reject junctions or symbolic links that could lead outside it. Preserve `dist/win-unpacked`, source code, dependencies, and user data.
- Report what was removed and the disk space reclaimed. If a tool rejects the operation, report the actual rejection; do not claim cleanup succeeded or bypass the restriction.

This records the user's project-level authorization; it does not change platform or tool-enforced policies.
