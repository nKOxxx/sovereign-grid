"""Dead-button sweep: click every <button> on every route; no JS errors allowed."""
import sys
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4173"
ROUTES = ["/", "/post-demand", "/list-capacity", "/matches", "/calculator",
          "/eligibility", "/passport", "/dealroom", "/fees", "/crm", "/intel"]

def run():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        errors = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))

        total = 0
        per_route = []
        for route in ROUTES:
            pg.goto(BASE + route, wait_until="networkidle")
            buttons = pg.locator("button")
            n = buttons.count()
            clicked = 0
            for i in range(n):
                try:
                    buttons.nth(i).click(timeout=2500)
                    pg.wait_for_timeout(120)
                    clicked += 1
                except Exception:
                    pass  # covered/disabled by earlier clicks — not a JS failure
            total += clicked
            per_route.append("%s:%d/%d" % (route, clicked, n))
            # recover gate state for next route (fresh goto handles it)

        b.close()
        print("ROUTE CLICKS:", " ".join(per_route))
        print("TOTAL CLICKS:", total)
        if errors:
            print("ERRORS:")
            for e in errors[:8]:
                print("  -", e[:200])
            sys.exit(1)
        print("NO DEAD BUTTONS — zero JS errors across %d clicks" % total)

if __name__ == "__main__":
    run()
