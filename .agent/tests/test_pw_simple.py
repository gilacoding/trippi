#!/usr/bin/env python3
"""Simple Playwright connectivity test."""
import asyncio
from playwright.async_api import async_playwright

async def test():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, args=['--no-sandbox'])
        ctx = await browser.new_context()
        page = await ctx.new_page()
        await page.goto("http://localhost:8080/trip-planner.html", wait_until='domcontentloaded')
        await page.wait_for_timeout(5000)
        title = await page.title()
        print(f"Page title: {title}")
        url = await page.evaluate("window.location.href")
        print(f"URL: {url}")
        has_group = await page.evaluate("document.getElementById('groupView') !== null")
        print(f"groupView exists: {has_group}")
        await browser.close()
        print("✅ Playwright works!")

asyncio.run(test())
