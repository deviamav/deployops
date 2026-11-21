#!/usr/bin/env python3
"""Upload pack + setup.sh and run setup.sh all with password SSH (no key)."""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import paramiko

HOST = os.environ.get("DEPLOY_HOST", "")
PASSWORD = os.environ.get("DEPLOY_PASSWORD", "")
DOMAIN = os.environ.get("DEPLOY_DOMAIN", HOST)
ADMIN_EMAIL = os.environ.get("DEPLOY_ADMIN_EMAIL", "admin@example.com")
ADMIN_PASSWORD = os.environ.get("DEPLOY_ADMIN_PASSWORD", "ChangeMe_2026")
LE_EMAIL = os.environ.get("DEPLOY_LE_EMAIL", ADMIN_EMAIL)
SKIP_CERTBOT = os.environ.get("SKIP_CERTBOT", "1")

if not HOST or not PASSWORD:
    raise SystemExit("Set DEPLOY_HOST and DEPLOY_PASSWORD env vars")

ROOT = Path(__file__).resolve().parent.parent
FILES = [
    ROOT / "scripts" / "setup.sh",
    ROOT / "deployops.tar.gz",
]


def connect() -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    print(f"[ssh] root@{HOST} ...")
    client.connect(
        HOST,
        username="root",
        password=PASSWORD,
        timeout=45,
        allow_agent=False,
        look_for_keys=False,
    )
    print("  OK connected")
    return client


def upload(client: paramiko.SSHClient) -> None:
    sftp = client.open_sftp()
    for path in FILES:
        if not path.is_file():
            raise SystemExit(f"missing file: {path}")
        remote = f"/root/{path.name}"
        print(f"[upload] {path.name} ({path.stat().st_size // 1024} KB) -> {remote}")
        sftp.put(str(path), remote)
        print("  OK")
    sftp.close()


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 3600) -> int:
    print(f"\n[run] {cmd}\n")
    chan = client.get_transport().open_session()
    chan.get_pty(width=160, height=40)
    chan.exec_command(cmd)
    chan.settimeout(2.0)
    start = time.time()
    while True:
        if chan.recv_ready():
            data = chan.recv(65535).decode("utf-8", errors="replace")
            sys.stdout.write(data)
            sys.stdout.flush()
        if chan.recv_stderr_ready():
            data = chan.recv_stderr(65535).decode("utf-8", errors="replace")
            sys.stderr.write(data)
            sys.stderr.flush()
        if chan.exit_status_ready():
            # drain
            while chan.recv_ready():
                sys.stdout.write(chan.recv(65535).decode("utf-8", errors="replace"))
            break
        if time.time() - start > timeout:
            chan.close()
            raise TimeoutError(f"command timed out after {timeout}s")
        time.sleep(0.2)
    code = chan.recv_exit_status()
    print(f"\n[exit] {code}")
    return code


def main() -> int:
    client = connect()
    try:
        upload(client)
        # ensure unix line endings + executable
        run(client, "sed -i 's/\\r$//' /root/setup.sh && chmod +x /root/setup.sh", timeout=60)
        cmd = (
            f"DOMAIN={DOMAIN!r} "
            f"ALLOW_PASSWORD_SSH=1 "
            f"DEPLOYOPS_PASSWORD={PASSWORD!r} "
            f"ADMIN_EMAIL={ADMIN_EMAIL!r} "
            f"ADMIN_PASSWORD={ADMIN_PASSWORD!r} "
            f"LE_EMAIL={LE_EMAIL!r} "
            f"SKIP_CERTBOT={SKIP_CERTBOT} "
            f"ARCHIVE=/root/deployops.tar.gz "
            f"bash /root/setup.sh all"
        )
        # Use single-quoted env assignment style safer for shell
        cmd = (
            "export "
            f"DOMAIN='{DOMAIN}' "
            "ALLOW_PASSWORD_SSH=1 "
            f"DEPLOYOPS_PASSWORD='{PASSWORD}' "
            f"ADMIN_EMAIL='{ADMIN_EMAIL}' "
            f"ADMIN_PASSWORD='{ADMIN_PASSWORD}' "
            f"LE_EMAIL='{LE_EMAIL}' "
            f"SKIP_CERTBOT='{SKIP_CERTBOT}' "
            "ARCHIVE=/root/deployops.tar.gz; "
            "bash /root/setup.sh all"
        )
        code = run(client, cmd, timeout=45 * 60)
        return code
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
