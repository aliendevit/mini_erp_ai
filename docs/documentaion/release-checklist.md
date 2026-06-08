# Release Checklist - OMRAN ERP

هذه القائمة تستخدم قبل أي demo رسمي أو release تجريبي أو نسخة جاهزة للعرض. الهدف هو التأكد أن النظام مستقر، قابل للتجربة، ولا يحتوي مشاكل واضحة في البيئة، الأسرار، البناء، الاختبارات، الواجهة، اللغة العربية، والميزات الأساسية.

## Release Type

حدد نوع الإصدار قبل البدء:

| Type | Meaning | Required Level |
| --- | --- | --- |
| Demo Release | عرض للـ mentor أو customer بدون بيانات حقيقية | Build + main flows + UI review |
| Internal Pilot | تجربة داخلية ببيانات اختبار | Tests + API testing + tracking/monitoring review |
| Production Release | استخدام حقيقي مع بيانات عملاء | Security + auth + backups + deployment hardening |

الوضع الحالي المقترح للمشروع: **Demo / Internal Pilot**, وليس Production كامل بعد.

---

## 1. Environment And Secrets

| Check | Required Action | Status |
| --- | --- | --- |
| `.env` not committed | تأكد أن `backend-python/.env` غير مرفوع على GitHub | [ ] |
| `.env.local` not committed | تأكد أن `frontend/.env.local` غير مرفوع | [ ] |
| `.env.example` has no real keys | يجب أن يحتوي placeholders فقط وليس مفاتيح حقيقية | [ ] |
| API keys stored only in backend | Gemini / OpenRouter / AssemblyAI لا تظهر في frontend | [ ] |
| CORS is correct | `CORS_ORIGIN` مطابق لرابط الواجهة المستخدمة | [ ] |
| Database URL verified | `DATABASE_URL` صحيح للبيئة الحالية | [ ] |

Command:

```powershell
git status --short
```

Search for possible secrets before push:

```powershell
git diff --cached
```

---

## 2. Backend Health And Tests

| Check | Required Action | Status |
| --- | --- | --- |
| Backend starts | FastAPI يعمل بدون crash | [ ] |
| Health endpoint works | `GET /api/health` يرجع `ok: true` | [ ] |
| Backend tests pass | كل tests تمر بنجاح | [ ] |
| AI endpoints do not crash | AI Intake / Proposal / Monitoring تعمل أو ترجع error واضح | [ ] |
| Upload endpoints work | رفع صور Project Tracking يعمل | [ ] |
| PDF generation works | Proposal PDF و Invoice PDF تعمل | [ ] |

Commands:

```powershell
cd backend-python
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 3001
```

In another terminal:

```powershell
cd backend-python
.\.venv\Scripts\python.exe -m unittest discover tests
```

Health check:

```text
http://localhost:3001/api/health
```

---

## 3. Frontend Build And Performance

| Check | Required Action | Status |
| --- | --- | --- |
| Frontend install ready | Dependencies available | [ ] |
| Production build passes | `npm run build` بدون errors | [ ] |
| No hydration errors | لا تظهر hydration errors في browser console | [ ] |
| No critical runtime errors | لا توجد crashes عند فتح الصفحات الرئيسية | [ ] |
| Main pages responsive | Dashboard / AI Intake / Tracking / Monitoring تعمل على mobile | [ ] |
| Heavy lists controlled | Chat history / drafts / tables collapsed أو paginated | [ ] |
| FPS acceptable | التنقل والscroll مقبول بدون lag واضح | [ ] |

Commands:

```powershell
cd frontend
npm run build
```

Manual check pages:

- `/`
- `/ai-intake`
- `/customers`
- `/orders`
- `/sites`
- `/workshops`
- `/drafts`
- `/invoices`
- `/monitoring`
- `/orders/{id}`
- `/orders/{id}/tracking`
- `/orders/{id}/monitoring`

---

## 4. Arabic And RTL Review

| Check | Required Action | Status |
| --- | --- | --- |
| Arabic labels readable | لا تظهر `????` أو text broken | [ ] |
| RTL layout acceptable | AI Intake / Tracking / Monitoring لا تتداخل بالعربي | [ ] |
| Arabic chat works | رسالة عربية تعطي رد عربي طبيعي | [ ] |
| Arabic PDF works | Proposal PDF بالعربي يظهر بشكل صحيح | [ ] |
| Forms readable | ألوان النص داخل input/select واضحة في dark/light themes | [ ] |
| Settings menu works in Arabic | لا يخرج خارج الشاشة ولا يغطي بشكل سيئ | [ ] |

Manual Arabic test message:

```text
عندي مشروع ترميم لشركة إعمار الشام. الموقع في دمشق، حي المزة، بناء رقم ١٥. المطبخ يحتاج قلع البلاط القديم وتركيب سيراميك جديد، والحمام يحتاج عزل مائي وتبديل مغسلة، وغرفة الجلوس تحتاج دهان داخلي.
```

---

## 5. Main Business Flow Test

| Flow | Expected Result | Status |
| --- | --- | --- |
| Create AI Intake | Intake draft created | [ ] |
| Send chat messages | Assistant collects requirements naturally | [ ] |
| Generate Proposal | Proposal has customer, sites, scope, payments | [ ] |
| Review/edit proposal | Manager can edit fields | [ ] |
| Recommend workshops | System suggests/marks workshop needs | [ ] |
| Confirm to Order | Order is created successfully | [ ] |
| Open Order Detail | Sites and workshop section visible | [ ] |
| Open Tracking | Tracking page loads correctly | [ ] |
| Open AI Monitoring | Monitoring page loads and analyzes order | [ ] |
| Generate PDF | Proposal PDF opens/downloads | [ ] |

---

## 6. Workshops And Scheduling

| Check | Required Action | Status |
| --- | --- | --- |
| Add workshop | Manager can create workshop partner | [ ] |
| Edit workshop | Manager can update specialties and availability | [ ] |
| Availability respected | Not available workshops are not suggested as active choices | [ ] |
| Assign workshop to site | Site can receive workshop assignment | [ ] |
| Schedule dates visible | Start/end date visible where assignment exists | [ ] |
| Overlap rule works | Two different workshops cannot overlap on same site | [ ] |
| Different sites allowed | Overlap on different sites is allowed | [ ] |

---

## 7. Project Tracking

| Check | Required Action | Status |
| --- | --- | --- |
| Overview loads | Dashboard cards and site cards load | [ ] |
| Add progress update | Update can be created | [ ] |
| Upload photos | Valid images upload and preview | [ ] |
| Add task | Task can be created with status/progress/weight | [ ] |
| Add issue | Issue can be created/resolved | [ ] |
| Add material | Material can be created and status updated | [ ] |
| Baseline suggestion | Draft baseline can be generated | [ ] |
| Baseline confirmation | Manager can confirm planned dates | [ ] |
| Warnings useful | Warning info button explains what to fix | [ ] |

---

## 8. AI Monitoring

| Check | Required Action | Status |
| --- | --- | --- |
| Monitoring page opens | User can choose/open project monitoring | [ ] |
| Analyze button works | AI monitoring analysis returns text | [ ] |
| Planned vs actual shown | Percentages visible when baseline/tasks exist | [ ] |
| Delay status shown | on_track / watch / delayed / unknown appears correctly | [ ] |
| Missing info explained | AI explains missing baseline/tasks/issues if needed | [ ] |
| No invented official values | AI explains backend values only | [ ] |
| Alerts visible | Monitoring alerts are shown when generated | [ ] |

---

## 9. Invoices And Documents

| Check | Required Action | Status |
| --- | --- | --- |
| Invoice list loads | Invoices page works | [ ] |
| Invoice detail opens | Invoice detail page works | [ ] |
| PDF export works | PDF opens/downloads | [ ] |
| Word export works if enabled | Word file downloads correctly | [ ] |
| Arabic document output | Arabic text is readable where supported | [ ] |
| Draft/merge flow works | Draft invoice grouping/merge works if used | [ ] |

---

## 10. Documentation And Handover

| Check | Required Action | Status |
| --- | --- | --- |
| Code documentation exists | Architecture, API, AI features, developer guide available | [ ] |
| User guide exists | Manager guide is available | [ ] |
| API testing guide exists | Postman guide and collection available | [ ] |
| Release checklist updated | This checklist reflects current system state | [ ] |
| Presentation updated | Slides reflect latest UI/AI features | [ ] |
| Known limitations documented | Production gaps are clear | [ ] |

Documentation paths:

```text
docs/documentaion/architecture.md
docs/documentaion/api-reference.md
docs/documentaion/ai-features.md
docs/documentaion/developer-guide.md
docs/documentaion/api-testing-guide.md
docs/documentaion/user-guide-manager-ar.md
docs/documentaion/release-checklist.md
```

---

## 11. Git And Push Safety

| Check | Required Action | Status |
| --- | --- | --- |
| Git status reviewed | No accidental files staged | [ ] |
| Env files excluded | `.env`, `.env.local`, real secrets not staged | [ ] |
| Large files reviewed | Large PDFs/PPTX/DOCX reviewed before staging | [ ] |
| Commit message clear | Message describes changes | [ ] |
| Push branch verified | Push to correct branch | [ ] |

Commands:

```powershell
git status --short
git diff --cached
```

---

## 12. Final Go / No-Go Decision

| Category | Demo Release | Internal Pilot | Production |
| --- | --- | --- | --- |
| Backend tests pass | Required | Required | Required |
| Frontend build passes | Required | Required | Required |
| Main flow works | Required | Required | Required |
| Arabic UI reviewed | Required | Required | Required |
| Postman/API tests | Recommended | Required | Required |
| Auth and roles | Optional | Recommended | Required |
| Audit log | Optional | Recommended | Required |
| Backup strategy | Optional | Required | Required |
| Production DB | Optional | Required | Required |
| Monitoring/logging | Optional | Recommended | Required |

Recommended decision for current project stage:

```text
Ready for demo/internal pilot after checklist items for build, tests, Arabic UI, AI Intake, Project Tracking, AI Monitoring, and PDF are passed.
Not ready for full production until authentication, roles, audit log, backup, and production deployment are completed.
```
