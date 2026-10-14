# checkpoint
- mock=real serve: scripts/test-server.sh ends with '$BIN serve' (L44-ish), mock only swaps model (mock-llm.mjs, opencode.json). 
- no opencode binary on machine (not in PATH); building/running from vendor source next
- mkdir lock not taken yet
- build done (exit 0); c13 script written; next: lock + start server + run
- server up (wrapper /tmp/oco-card1-bin/opencode runs vendor src via bun); Code bin is 'Electron' -> OCO_VSCODE_BIN
- run done exit 0; lock released; server stopped
