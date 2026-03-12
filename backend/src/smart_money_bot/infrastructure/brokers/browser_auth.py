"""
Browser-based Tradovate authentication.

Opens a real Chromium window so the user can log in manually
(solving CAPTCHA if required). We intercept the auth API response
to capture the access token, then feed it to TradovateBroker.
"""
from __future__ import annotations

import asyncio
import logging

log = logging.getLogger(__name__)


async def browser_login_tradovate(
    username: str = "",
    password: str = "",
    live: bool = False,
    timeout_seconds: int = 180,
) -> dict:
    """
    Launch a headed Chromium browser → Tradovate login page.

    Returns
    -------
    dict  with keys:
        success: bool
        access_token: str | None
        md_access_token: str | None
        error: str | None
    """
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return {
            "success": False,
            "error": (
                "Playwright is not installed. "
                "Run:  pip install playwright && python -m playwright install chromium"
            ),
        }

    captured: dict = {}

    url = "https://trader.tradovate.com/"
    log.info(f"Launching browser for Tradovate login ({url}) …")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=False,
            args=["--start-maximized"],
        )
        context = await browser.new_context(no_viewport=True)
        page = await context.new_page()

        # ── intercept auth responses ──────────────────────────────
        async def _on_response(response):
            url_lower = response.url.lower()
            auth_endpoints = (
                "auth/accesstokenrequest",
                "auth/oauthtoken",
                "auth/renewaccesstoken",
            )
            if any(ep in url_lower for ep in auth_endpoints):
                try:
                    body = await response.json()
                    if isinstance(body, dict) and body.get("accessToken"):
                        captured["access_token"] = body["accessToken"]
                        captured["md_access_token"] = body.get(
                            "mdAccessToken", ""
                        )
                        captured["expiration"] = body.get(
                            "expirationTime", ""
                        )
                        log.info("✓ Captured auth token from browser response")
                except Exception:
                    pass

        page.on("response", _on_response)

        # ── navigate ──────────────────────────────────────────────
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        except Exception as e:
            log.warning(f"Navigation issue (continuing): {e}")

        # ── pre-fill credentials ──────────────────────────────────
        await asyncio.sleep(3)  # let SPA bootstrap
        try:
            name_selectors = [
                'input[name="name"]',
                'input[placeholder*="user" i]',
                'input[placeholder*="name" i]',
                'input[autocomplete="username"]',
                'input[type="text"]',
            ]
            for sel in name_selectors:
                loc = page.locator(sel).first
                if await loc.count() > 0 and username:
                    await loc.fill(username)
                    log.info("Pre-filled username")
                    break

            pwd_loc = page.locator('input[type="password"]').first
            if await pwd_loc.count() > 0 and password:
                await pwd_loc.fill(password)
                log.info("Pre-filled password")
        except Exception as e:
            log.debug(f"Pre-fill skipped: {e}")

        # ── wait for token capture ────────────────────────────────
        log.info(
            "Waiting for you to complete login in the browser window… "
            f"(timeout {timeout_seconds}s)"
        )

        for _ in range(timeout_seconds * 2):
            if captured.get("access_token"):
                await asyncio.sleep(1)  # let page settle
                break
            # Stop waiting if the user closed the browser window
            if not browser.is_connected():
                break
            await asyncio.sleep(0.5)

        # ── fallback: scan localStorage ───────────────────────────
        if not captured.get("access_token") and browser.is_connected():
            try:
                ls_token = await page.evaluate(
                    """() => {
                    for (const [key, val] of Object.entries(localStorage)) {
                        const k = key.toLowerCase();
                        if (k.includes('token') || k.includes('auth')) {
                            try {
                                const j = JSON.parse(val);
                                if (j.accessToken) return {
                                    accessToken: j.accessToken,
                                    mdAccessToken: j.mdAccessToken || '',
                                };
                            } catch {
                                if (val && val.length > 30 && !val.includes(' '))
                                    return { accessToken: val, mdAccessToken: '' };
                            }
                        }
                    }
                    return null;
                }"""
                )
                if ls_token and ls_token.get("accessToken"):
                    captured["access_token"] = ls_token["accessToken"]
                    captured["md_access_token"] = ls_token.get(
                        "mdAccessToken", ""
                    )
                    log.info("✓ Captured token from localStorage")
            except Exception:
                pass

        # ── clean up ──────────────────────────────────────────────
        try:
            await browser.close()
        except Exception:
            pass

    if captured.get("access_token"):
        return {
            "success": True,
            "access_token": captured["access_token"],
            "md_access_token": captured.get("md_access_token") or None,
        }

    return {
        "success": False,
        "error": (
            "Login timed out or the browser was closed before "
            "authentication completed. Please try again."
        ),
    }
