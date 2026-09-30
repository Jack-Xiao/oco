# GCP Workstation Remote-SSH reliability — 2026-09-30

Scope: personal workstation connection repair, not oco Remote-SSH feature acceptance.

## Baseline
- VS Code 1.139.1, commit 04c0d99f4fb0d8afe6ce4f0c58e31e183ac3e4b1; Remote-SSH 0.128.0; Google Cloud SDK 586.0.0.
- Workstation `w-zhizhihwh-mumckyfl`, project `vscode-workstation-lab`, region `asia-east2`, cluster `cluster-mumbhexe`, config `vscode-lab-small`.
- Live describe returned STATE_RUNNING; expected Google account active (email omitted).
- 20:45–20:46 local VS Code logs: ConnectTimeout=15, banner timeout, then Python bridge ConnectionResetError(54), kex connection closed.
- Existing helper reused any listener at 127.0.0.1:52222, discarded gcloud stderr, detached tunnel lifecycle. Existing listener PID 14329 started 17:26:09; direct socket probe got EOF after about 1 second despite listener remaining up.
- Fresh authenticated gcloud tunnel on an allocated port: SSH command returned SSH_OK / Linux / VSCODE_SERVER_PRESENT, exit 0.
- Evidence establishes stale/unhealthy tunnel reuse; original tunnel stderr was discarded, so the underlying WebSocket failure reason cannot be recovered. Do not assert token expiry: installed SDK refreshes tokens every 2700 seconds.

## Repair / checks
- VS Code application connectTimeout changed 15 -> 240 seconds (setting supports application scope only); original JSONC preserved with timestamped backup.
- SSH ConnectTimeout=240 limited to existing gcp-workstation alias; backup created.
- Installed helper at `~/.ssh/gcp_workstation_ssh_proxy.py`: one owned dynamic loopback tunnel per SSH transport; fixed account; --start-workstation; preparation deadline 210 seconds; bounded startup input buffer; stderr drained and errors classified without relaying secrets; partial stdout writes handled; EOF/TERM/INT cleanup. No replay/reconnect after SSH bytes are exchanged.
- Additional root cause reproduced: GUI PATH `/usr/bin:/bin:/usr/sbin:/sbin` selects Python 3.9 for gcloud, which SDK 586 refuses. Terminal PATH selects supported Python. Fixed child-only `CLOUDSDK_PYTHON=/opt/homebrew/bin/python3` (3.13.1). No global shell change.
- Minimal GUI PATH + real installed proxy + SSH command: MINIMAL_GUI_ENV_OK, exit 0.
- Direct new proxy SSH: NEW_PROXY_OK / Linux, exit 0. Fresh diagnostic tunnel held remote command for 65 seconds: HOLD_OK, exit 0.
- Targeted tests: 4/4 PASS on final installed helper (partial writes, log redaction, startup EOF cleanup, SIGTERM cleanup). Initial signal test exposed InterruptedError being swallowed by selectors; fixed signal handler to raise RuntimeError and reran.
- Actual VS Code GUI after final fix: status bar `SSH: gcp-workstation`; opened existing `~/ai`; window `欢迎 — ai [SSH: gcp-workstation]`; terminal prompt `user@w-zhizhihwh-mumckyfl:~/ai$`. Renderer 21:00:04.999 resolveAuthority returned Managed(1). PASS for personal Remote-SSH connectivity.
- Existing unrelated Neovim missing-binary notifications remain; no extension configuration changes made for them.
- Backup files: `~/.ssh/gcp_workstation_ssh_proxy.py.backup-20260930-205604`, `~/.ssh/config.backup-gcp-20260930-205007`, Code User `settings.json.backup-gcp-20260930-204910`.
- Dedicated diagnostic tunnel cleaned up; existing old listener was not killed because it has an established connection; fixed helper never reuses it.
- Cold start after deliberately stopping the workstation, multi-hour/sleep/wake testing, and oco remote feature acceptance: NOT RUN.

Reference: https://docs.cloud.google.com/sdk/gcloud/reference/workstations/start-tcp-tunnel supports allocated local ports and --start-workstation.

Delegation checkpoint: grok_worker was asked to prepare a staging helper, but produced no visible artifact/report before main-agent implementation and UI completion. Main agent owns the installed repair and checks. Worker was sent the final checkpoint and interrupted; its model/provider are unknown. No worker completion is counted as evidence.
