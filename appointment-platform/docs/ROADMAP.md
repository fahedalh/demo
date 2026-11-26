# Development Roadmap

| Milestone | Scope | Status |
|-----------|-------|--------|
| M0 Foundations | Docs, monorepo, shared package, env config, logger, error model, design tokens | ✅ |
| M1 Auth & tenancy | Register/login/refresh/logout, RBAC + permissions, tenant middleware, audit log | ✅ |
| M2 Catalog | Categories (configurable flows), businesses, branches, staff, services, resources, exceptions | ✅ |
| M3 Booking engine | Slot engine, locks, create/approve/reject/cancel/reschedule/complete/no-show, recurring, group, resource, waitlist, guest tracking | ✅ |
| M4 Customer UX | Landing, explore + map, business page, booking wizard, account area | ✅ |
| M5 Business dashboard | Analytics, calendar with drag-and-drop, reservations, CRUD screens, settings, templates | ✅ |
| M6 Admin | Platform analytics, businesses, users, categories, plans, payments, settings, audit | ✅ |
| M7 Payments & notifications | Provider adapters (Stripe/cash/test), deposits, refunds, invoices; in-app/email/WhatsApp/SMS, reminders | ✅ (Stripe webhook verified by unit test only) |
| M8 i18n | EN/AR, RTL, currencies, timezones | ✅ |
| M9 AI layer | Provider interface, heuristic NL search, no-show risk, recommendations, LLM descriptions | ✅ (LLM optional) |
| M10 Quality | Unit tests (engine, policies, templates), API tests (need MongoDB), Docker | 🟡 |
| **Next** | Google/Outlook calendar sync (interface exists), web push, Stripe Billing for subscriptions, custom domains, SSO, mobile app, AI assistant chat, schedule optimisation, E2E (Playwright) suite | ⏳ |
