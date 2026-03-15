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

    When credentials are provided, auto-fills and auto-submits the
    login form. If a CAPTCHA appears, the browser stays open for
    the user to solve it manually.

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
                "auth/me",
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

        # ── wait for SPA to render the login form ─────────────────
        await asyncio.sleep(3)

        # ── auto-fill and submit login form ───────────────────────
        auto_submitted = False
        try:
            # Wait for the username field to be visible
            name_input = page.locator("#name-input")
            pwd_input = page.locator("#password-input")

            if await name_input.count() > 0 and username:
                await name_input.fill(username)
                log.info("Filled username")

            if await pwd_input.count() > 0 and password:
                await pwd_input.fill(password)
                log.info("Filled password")

            # Click the Login button if we have both credentials
            if username and password:
                # Find the Login button (exact text match)
                login_btn = page.locator("button", has_text="Login").first
                if await login_btn.count() > 0:
                    await login_btn.click()
                    log.info("Clicked Login button — waiting for auth…")
                    auto_submitted = True
                else:
                    # Fallback: try submitting the form directly
                    await pwd_input.press("Enter")
                    log.info("Pressed Enter on password field")
                    auto_submitted = True
        except Exception as e:
            log.warning(f"Auto-fill/submit issue: {e}")

        # ── wait for token capture ────────────────────────────────
        if auto_submitted:
            log.info(
                "Login submitted — waiting for token "
                "(solve CAPTCHA if the browser shows one)…"
            )
        else:
            log.info(
                "Please complete login in the browser window… "
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
