# NexaSua — Setup, Environment & Deployment Guide

Developed by **NexaFlow Technologies** · *Smart Schools. Brighter Futures.*

---

## 1. Environment Variables (Configure in AI Studio Secrets)

Add these variables in **Settings → Secrets** inside Google AI Studio (never hardcode secrets in code):

| Variable | Required? | Purpose |
| :--- | :--- | :--- |
| `MONGODB_URI` | **Required** for persistence | MongoDB Atlas connection string (`mongodb+srv://...`) |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Recommended | NexaFlow Super Admin login credentials secret pair (can be changed anytime in Settings → Secrets) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Optional | School Admin login credentials secret pair for instant secret-backed sign-in on `/login` |
| `JWT_SECRET` | Recommended for production | Random 32+ char string for session & QR token signing |
| `SUPER_ADMIN_SETUP_KEY` | Optional | Extra setup passcode required during first-time Super Admin creation (when email/password secrets are not set) |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional | Enables **Sign in with Google** on the School Portal and registration flow (excludes Super Admin) |
| `PAYSTACK_SECRET_KEY` | Optional | NexaFlow Technologies Paystack secret key for school subscriptions |
| `PAYSTACK_PUBLIC_KEY` | Optional | NexaFlow Technologies Paystack public key |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional | Transactional email (verification, password reset, fee reminders) |
| `SMS_PROVIDER_URL`, `SMS_API_KEY`, `SMS_SENDER_ID` | Optional | Ghana SMS gateway endpoint (e.g., Hubtel / Arkesel) |
| `GEMINI_API_KEY` | Optional | Enables optional AI remark & announcement drafts (no student PII sent) |
| `APP_URL` | Optional | Public URL of deployed app for Paystack/Google callbacks & QR links |

---

## 2. Step-by-Step Setup (No Coding Required)

1. **Create a MongoDB Atlas Cluster**:
   - Sign in to MongoDB Atlas, create a free/dedicated cluster, add a database user, allow network access (`0.0.0.0/0` for Cloud Run or specific egress IPs), and copy your connection string into `MONGODB_URI` in AI Studio Secrets.
2. **Configure Platform Super Admin**:
   - Set `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` in **AI Studio → Settings → Secrets** (you can update those secrets at any time to change your Super Admin email or password), **or** navigate directly to `/nexaflow-admin` on first run to claim the account inline.
   - Immediately configure **Two-Factor Authentication (TOTP MFA)** inside the Super Admin Overview tab.
3. **Configure Google Sign-In for Schools (Optional)**:
   - In Google Cloud Console → Credentials, create an OAuth 2.0 Web Client and add `<YOUR_APP_URL>/api/auth/google/callback` as an Authorized Redirect URI, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Secrets.
4. **Register & Approve First School**:
   - Register via `/register` on the public website or create a school directly inside the Super Admin Console.
   - Approve the pending school to generate its unique School Code (`NXS-XXX-NNNN`), activate its 14-day trial, and provision the default 30/70 grading template.
4. **Configure School Paystack Merchant (Optional for Complete Plan)**:
   - School Administrators enter their school's own Paystack Public & Secret keys under **Settings & Subscription**.
   - Set Paystack Webhook URL to `https://<your-app-domain>/api/webhooks/paystack`.

---

## 3. Build & Deployment Commands

- Development server (port 3000): `npm run dev`
- Production build: `npm run build`
- Production start: `npm run start`
- Type check: `npm run lint`
- Automated unit tests: `npm test`
