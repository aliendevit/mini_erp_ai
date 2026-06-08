# OMRAN ERP Documentation

This folder contains the technical and product documentation for the OMRAN ERP prototype.
The documentation is written to support developers, frontend integration, mentor review, and customer-facing demonstrations.

## Documentation Map

| Document | Audience | Purpose |
| --- | --- | --- |
| `architecture.md` | Developers, mentors | Explains the system architecture, layers, data flow, and boundaries. |
| `ai-features.md` | AI/backend, product, mentors | Documents the implemented AI features, current limits, and expected behavior. |
| `api-reference.md` | Frontend developers, testers | Lists the main backend endpoints and recommended testing flow. |
| `developer-guide.md` | Developers | Explains local setup, run commands, tests, and code organization. |
| `release-readiness.md` | Team, project lead | Shows what is ready, what is still risky, and what is needed before live release. |

## Current Product Direction

OMRAN ERP is a construction-focused management system for project intake, proposal generation, workshop-based execution, project tracking, AI monitoring, and invoicing.

The current prototype focuses on:

- AI-assisted project intake and proposal drafting.
- Workshop/subcontractor-based execution instead of internal employee staffing.
- Project tracking with tasks, issues, materials, photos, baseline planning, and schedule warnings.
- AI monitoring that reviews tracking data and explains risks, delays, blockers, and missing information.
- Multilingual UI direction with Arabic support as a first-class requirement.

## Current Release State

The system is suitable for prototype demonstrations and controlled testing.
It is not yet production-ready until authentication, deployment security, data backup, file storage strategy, and production AI governance are completed.

## Important Repository Notes

- Do not commit `.env`, `.env.local`, or real API keys.
- Keep `.env.example` generic and secret-free.
- Large generated files should be reviewed before committing.
- Legacy employee modules may still exist in the codebase, but the visible product flow is workshop-oriented.

## API Testing

Use `api-testing-guide.md` with `postman-omran-api-collection.json` to test AI Intake, proposal generation, workshops, project tracking, and AI monitoring without Swagger.


## User Guide

Use `user-guide-manager-ar.md` as the non-technical manager guide. It explains how to start an AI Intake, generate a proposal, assign workshops, track execution, use AI Monitoring, and manage invoices.

## Release Checklist

Use `release-checklist.md` before demo, internal pilot, or release. It covers environment safety, tests, frontend build, Arabic/RTL review, main business flows, workshops, tracking, AI monitoring, invoices, documentation, and Git push safety.
