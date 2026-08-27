# Extra Plus Landing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a new WordPress landing page for Extra+ that combines the current program page, product purchase details, and homepage feedback/social proof.

**Architecture:** Create a new WordPress Page with the active theme header/footer and a self-contained HTML/CSS landing body. Keep existing program and product pages unchanged. CTAs link to the existing WooCommerce product page to preserve checkout behavior.

**Tech Stack:** WordPress admin, WooCommerce product page, theme page content, inline HTML/CSS.

## Global Constraints

- Do not modify the existing `/programs/extra_plus/` page.
- Do not modify the existing `/product/extra-plus/` product.
- Publish one new page only.
- Use Arabic RTL copy.
- Main CTA links to `https://eat-love-fit.com/product/extra-plus/`.

---

### Task 1: Create Landing Page Content

**Files:**
- Create live WordPress page: `Extra+ | المسار الكامل`

**Interfaces:**
- Consumes: current program page copy, current product price/date options, homepage feedback positioning.
- Produces: published landing page URL.

- [ ] Draft page HTML with sections: hero, problem, promise, fit, deliverables, proof, founder, pricing, FAQ, final CTA.
- [ ] Log in through `/my-account/`.
- [ ] Open `/wp-admin/post-new.php?post_type=page`.
- [ ] Fill title and content.
- [ ] Publish page.
- [ ] Verify public URL loads and CTAs point to the product.

### Task 2: Verify Page

**Files:**
- Screenshot: `.gstack/qa-reports/eat-love-fit-2026-07-01/extra-plus-planning/screenshots/`

**Interfaces:**
- Consumes: published landing page URL.
- Produces: verification screenshot and final report.

- [ ] Open the public page on desktop.
- [ ] Confirm page has no `Teenagres` typo.
- [ ] Confirm CTA links to `/product/extra-plus/`.
- [ ] Capture screenshot.
