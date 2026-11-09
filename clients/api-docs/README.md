# Backend API Documentation

This directory contains frontend-facing integration documentation for the Laravel API in `backend/`.

## Documentation Standard

Every backend feature must be documented in two places:

1. `openapi/openapi.yaml`
   - Source of truth for API contracts, request/response schemas, and tooling.
   - Best for frontend integration, Postman imports, and future Swagger/ReDoc rendering.
2. `docs/features/*.md`
   - Human-readable implementation and integration notes for frontend developers.
   - Best for onboarding, examples, validation notes, and breaking change explanations.

## Required Sections For Every Feature

Each feature document must include:

1. Feature overview
2. API endpoints and methods
3. Request structure
4. Response structure with success and error examples
5. Authentication requirements
6. Validation rules
7. Status codes and error messages
8. Example requests in cURL and/or Postman-friendly form
9. Breaking changes, if any

## Current Feature Docs

1. [Health API](features/health.md)
2. [Onboarding & Registration API](features/onboarding.md)
3. [Admin Dashboard](features/admin-dashboard.md)
4. [Enterprise Onboarding](features/enterprise-onboarding.md)
5. [Task Management API](features/task-management.md)
6. [Internal User Onboarding API](features/internal-user-onboarding.md)
7. [Authentication API](features/authentication.md)
8. [Project Management API](features/project-management.md)
9. [Payroll Management API](features/payroll-management.md)
10. [Task Tracking Realtime API](features/task-tracking-realtime.md)
11. [CRM Management API](features/crm-management.md)
12. [Dashboard Overview API](features/dashboard-overview.md)
13. [Workforce Summary API](features/workforce-summary.md)
14. [Rollout Readiness Checklist](features/rollout-readiness-checklist.md)
15. [Authentication API](features/authentication.md) includes reset-link password recovery endpoints

## OpenAPI Contract

Current API contract:

1. [OpenAPI specification](../openapi/openapi.yaml)

## Update Rule

If backend logic changes and the API contract, validation, status codes, or payloads change, documentation must be updated in the same change set.

For every new API, always:

1. Update `openapi/openapi.yaml`
2. Add or update the corresponding `docs/features/*.md` file
3. Update this `docs/README.md` feature index
