#!/usr/bin/env python3
"""O roteiro tests/e2e/e2e.js conferido no Linux, antes de ir para a máquina do dono: o Stillpoint de teste
(tests/host) com o Lightroom de mentira, que atende os mesmos comandos de teste do plugin (TestCmd.lua).
    python3 tests/e2e/check_linux.py
"""
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "host"))
from playwright.sync_api import sync_playwright  # noqa: E402

base = tempfile.mkdtemp(prefix="stillpoint-e2e-")
report = os.path.join(base, "report.txt")
project = os.path.join(base, "self-test-project", "Stillpoint Self-Test")
catalog = os.path.join(project, "Lightroom", "Stillpoint Self-Test", "Stillpoint Self-Test.lrcat")
os.makedirs(os.path.dirname(catalog))
open(catalog, "w").close()
os.environ.update(STILLPOINT_E2E=report, STILLPOINT_E2E_SCRIPT=os.path.join(HERE, "e2e.js"), STILLPOINT_E2E_PROJECT=project)
import run_tests as R  # noqa: E402

with sync_playwright() as pw:
    t = R.T(pw)
    t.lr.catalog = catalog
    try:
        end = time.time() + 400
        text = ""
        while time.time() < end:
            text = open(report).read() if os.path.exists(report) else ""
            if "\nEND" in "\n" + text:
                break
            time.sleep(1)
        print(text)
        if "\nEND" not in "\n" + text:
            print("NOT FINISHED after 400 s; page errors:", t.errors)
            t.page.screenshot(path=os.path.join(base, "stuck.png"))
            print("screenshot:", os.path.join(base, "stuck.png"))
        print("page errors:", t.errors)
        print("---- fake Lightroom log ----")
        print("\n".join(t.lr.log[-25:]))
    finally:
        t.close()
sys.exit(0 if " 0 failed" in text else 1)
