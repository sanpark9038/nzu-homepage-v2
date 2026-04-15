# TMP Operation Rules

1. Temporary HTML captures under `tmp/` should be treated as short-lived debugging artifacts.
2. Large temporary text and log files should be cleaned when they are no longer needed.
3. JSON outputs kept under `tmp/` should support report inspection or debugging only.
4. Do not rely on `tmp/` artifacts as long-term source-of-truth data.
5. Promote anything durable into `data/metadata/` or documented pipeline outputs.
