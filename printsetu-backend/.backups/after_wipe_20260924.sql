--
-- PostgreSQL database dump
--

\restrict GOnYZeHWauo7FTAE8kyaaxSiF5PuKMMAe5C1uLD94PRP7as4eFvQGCEhgGQ8zlt

-- Dumped from database version 16.15
-- Dumped by pg_dump version 17.10 (Ubuntu 17.10-1.pgdg22.04+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: printsetu
--

-- *not* creating schema, since initdb creates it


ALTER SCHEMA public OWNER TO printsetu;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: printsetu
--

COMMENT ON SCHEMA public IS '';


--
-- Name: BillingCycle; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."BillingCycle" AS ENUM (
    'DAILY',
    'MONTHLY',
    'YEARLY'
);


ALTER TYPE public."BillingCycle" OWNER TO printsetu;

--
-- Name: ColorMode; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."ColorMode" AS ENUM (
    'BW',
    'COLOR'
);


ALTER TYPE public."ColorMode" OWNER TO printsetu;

--
-- Name: DocumentStatus; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."DocumentStatus" AS ENUM (
    'UPLOADED',
    'PROCESSING',
    'PROCESSED',
    'ANALYSIS_FAILED',
    'PRINT_ELIGIBLE',
    'DELETED'
);


ALTER TYPE public."DocumentStatus" OWNER TO printsetu;

--
-- Name: InvoiceKind; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."InvoiceKind" AS ENUM (
    'INITIAL',
    'RENEWAL',
    'UPGRADE'
);


ALTER TYPE public."InvoiceKind" OWNER TO printsetu;

--
-- Name: InvoiceStatus; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."InvoiceStatus" AS ENUM (
    'OPEN',
    'PAID',
    'FAILED',
    'VOID',
    'PARTIALLY_REFUNDED',
    'REFUNDED'
);


ALTER TYPE public."InvoiceStatus" OWNER TO printsetu;

--
-- Name: NotificationChannel; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."NotificationChannel" AS ENUM (
    'IN_APP',
    'EMAIL',
    'SMS',
    'WHATSAPP'
);


ALTER TYPE public."NotificationChannel" OWNER TO printsetu;

--
-- Name: NotificationEvent; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."NotificationEvent" AS ENUM (
    'UPLOAD_RECEIVED',
    'PRINT_QUEUED',
    'PRINT_COMPLETED',
    'PRINT_FAILED',
    'SUBSCRIPTION_RENEWAL_REMINDER',
    'SUBSCRIPTION_PAYMENT_FAILED',
    'SUBSCRIPTION_GRACE_REMINDER',
    'SUBSCRIPTION_FINAL_WARNING',
    'SUBSCRIPTION_PAST_DUE',
    'SUBSCRIPTION_SUSPENDED',
    'SUBSCRIPTION_PAID',
    'SUBSCRIPTION_REACTIVATED',
    'SUBSCRIPTION_CANCELLED',
    'SUBSCRIPTION_TRIAL_ENDING'
);


ALTER TYPE public."NotificationEvent" OWNER TO printsetu;

--
-- Name: NotificationStatus; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."NotificationStatus" AS ENUM (
    'PENDING',
    'SENT',
    'FAILED'
);


ALTER TYPE public."NotificationStatus" OWNER TO printsetu;

--
-- Name: PaperSize; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."PaperSize" AS ENUM (
    'A4',
    'A3',
    'LETTER',
    'LEGAL'
);


ALTER TYPE public."PaperSize" OWNER TO printsetu;

--
-- Name: PaymentMethod; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."PaymentMethod" AS ENUM (
    'CASH',
    'BANK_TRANSFER',
    'UPI',
    'CARD',
    'GATEWAY',
    'OTHER'
);


ALTER TYPE public."PaymentMethod" OWNER TO printsetu;

--
-- Name: PrintJobStatus; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."PrintJobStatus" AS ENUM (
    'CREATED',
    'PRINT_ELIGIBLE',
    'QUEUED',
    'PRINTING',
    'PRINTED',
    'RETENTION_PENDING',
    'DELETED',
    'PRINT_FAILED',
    'AGENT_OFFLINE',
    'PRINT_UNKNOWN',
    'CANCELLED'
);


ALTER TYPE public."PrintJobStatus" OWNER TO printsetu;

--
-- Name: PrinterStatus; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."PrinterStatus" AS ENUM (
    'ONLINE',
    'OFFLINE',
    'UNKNOWN',
    'REMOVED'
);


ALTER TYPE public."PrinterStatus" OWNER TO printsetu;

--
-- Name: QrStatus; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."QrStatus" AS ENUM (
    'ACTIVE',
    'REVOKED'
);


ALTER TYPE public."QrStatus" OWNER TO printsetu;

--
-- Name: RoleName; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."RoleName" AS ENUM (
    'ADMIN',
    'SHOPKEEPER'
);


ALTER TYPE public."RoleName" OWNER TO printsetu;

--
-- Name: ShopStatus; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."ShopStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


ALTER TYPE public."ShopStatus" OWNER TO printsetu;

--
-- Name: SideMode; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."SideMode" AS ENUM (
    'SIMPLEX',
    'DUPLEX'
);


ALTER TYPE public."SideMode" OWNER TO printsetu;

--
-- Name: SubscriptionStatus; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."SubscriptionStatus" AS ENUM (
    'TRIAL',
    'ACTIVE',
    'PAYMENT_PENDING',
    'PAST_DUE',
    'SUSPENDED',
    'CANCELLED',
    'EXPIRED'
);


ALTER TYPE public."SubscriptionStatus" OWNER TO printsetu;

--
-- Name: UserStatus; Type: TYPE; Schema: public; Owner: printsetu
--

CREATE TYPE public."UserStatus" AS ENUM (
    'ACTIVE',
    'DISABLED'
);


ALTER TYPE public."UserStatus" OWNER TO printsetu;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    actor_user_id text,
    shop_id text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    ip text,
    user_agent text,
    metadata_json jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.audit_logs OWNER TO printsetu;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.documents (
    id text NOT NULL,
    shop_id text NOT NULL,
    original_name text NOT NULL,
    s3_key text NOT NULL,
    mime_type text NOT NULL,
    size_bytes integer NOT NULL,
    page_count integer,
    color_pages integer,
    color_detection_confidence text,
    status public."DocumentStatus" DEFAULT 'UPLOADED'::public."DocumentStatus" NOT NULL,
    uploaded_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at timestamp(3) without time zone,
    session_id text NOT NULL
);


ALTER TABLE public.documents OWNER TO printsetu;

--
-- Name: invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: printsetu
--

CREATE SEQUENCE public.invoice_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoice_number_seq OWNER TO printsetu;

--
-- Name: invoices; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.invoices (
    id text NOT NULL,
    number text NOT NULL,
    shop_id text NOT NULL,
    plan_id text,
    plan_name text NOT NULL,
    cycle public."BillingCycle" NOT NULL,
    kind public."InvoiceKind" DEFAULT 'RENEWAL'::public."InvoiceKind" NOT NULL,
    description text NOT NULL,
    period_start timestamp(3) without time zone NOT NULL,
    period_end timestamp(3) without time zone NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    status public."InvoiceStatus" DEFAULT 'OPEN'::public."InvoiceStatus" NOT NULL,
    due_date timestamp(3) without time zone NOT NULL,
    paid_at timestamp(3) without time zone,
    payment_method public."PaymentMethod",
    payment_reference text,
    attempt_count integer DEFAULT 0 NOT NULL,
    next_retry_at timestamp(3) without time zone,
    last_failure text,
    refunded_amount numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.invoices OWNER TO printsetu;

--
-- Name: notifications; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    shop_id text NOT NULL,
    print_job_id text,
    event_type public."NotificationEvent" NOT NULL,
    channel public."NotificationChannel" DEFAULT 'IN_APP'::public."NotificationChannel" NOT NULL,
    destination text,
    status public."NotificationStatus" DEFAULT 'PENDING'::public."NotificationStatus" NOT NULL,
    provider_ref text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    message text
);


ALTER TABLE public.notifications OWNER TO printsetu;

--
-- Name: pricing; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.pricing (
    id text NOT NULL,
    shop_id text NOT NULL,
    "paperSize" public."PaperSize" NOT NULL,
    "colorMode" public."ColorMode" NOT NULL,
    "sideMode" public."SideMode" NOT NULL,
    price_per_page numeric(10,2) NOT NULL,
    effective_from timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.pricing OWNER TO printsetu;

--
-- Name: print_job_events; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.print_job_events (
    id text NOT NULL,
    print_job_id text NOT NULL,
    status public."PrintJobStatus" NOT NULL,
    agent_attempt_id text,
    message text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.print_job_events OWNER TO printsetu;

--
-- Name: print_job_items; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.print_job_items (
    id text NOT NULL,
    print_job_id text NOT NULL,
    document_id text NOT NULL,
    "paperSize" public."PaperSize" NOT NULL,
    "colorMode" public."ColorMode" NOT NULL,
    "sideMode" public."SideMode" NOT NULL,
    copies integer NOT NULL,
    page_count integer NOT NULL,
    billable_pages integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    print_order integer NOT NULL,
    edit_state jsonb,
    rendered_at timestamp(3) without time zone,
    rendered_s3_key text
);


ALTER TABLE public.print_job_items OWNER TO printsetu;

--
-- Name: print_jobs; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.print_jobs (
    id text NOT NULL,
    shop_id text NOT NULL,
    printer_id text,
    quote_id text,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    status public."PrintJobStatus" DEFAULT 'CREATED'::public."PrintJobStatus" NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    idempotency_key text NOT NULL,
    queued_at timestamp(3) without time zone,
    printed_at timestamp(3) without time zone,
    failure_reason text,
    status_token text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    token_number integer NOT NULL
);


ALTER TABLE public.print_jobs OWNER TO printsetu;

--
-- Name: print_jobs_token_number_seq; Type: SEQUENCE; Schema: public; Owner: printsetu
--

CREATE SEQUENCE public.print_jobs_token_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.print_jobs_token_number_seq OWNER TO printsetu;

--
-- Name: print_jobs_token_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: printsetu
--

ALTER SEQUENCE public.print_jobs_token_number_seq OWNED BY public.print_jobs.token_number;


--
-- Name: print_quote_items; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.print_quote_items (
    id text NOT NULL,
    quote_id text NOT NULL,
    document_id text NOT NULL,
    "paperSize" public."PaperSize" NOT NULL,
    "colorMode" public."ColorMode" NOT NULL,
    "sideMode" public."SideMode" NOT NULL,
    copies integer NOT NULL,
    page_count integer NOT NULL,
    billable_pages integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    pricing_snapshot jsonb NOT NULL
);


ALTER TABLE public.print_quote_items OWNER TO printsetu;

--
-- Name: print_quotes; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.print_quotes (
    id text NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    status_token_claim_id text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    consumed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    session_id text NOT NULL
);


ALTER TABLE public.print_quotes OWNER TO printsetu;

--
-- Name: print_sessions; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.print_sessions (
    id text NOT NULL,
    shop_id text NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.print_sessions OWNER TO printsetu;

--
-- Name: print_settings; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.print_settings (
    id text NOT NULL,
    shop_id text NOT NULL,
    default_printer_id text,
    retention_minutes integer DEFAULT 30 NOT NULL,
    max_file_size integer DEFAULT 26214400 NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    document_preview_enabled boolean DEFAULT false NOT NULL,
    auto_accept_orders boolean DEFAULT false NOT NULL,
    notification_prefs jsonb,
    accepting_orders boolean DEFAULT true NOT NULL,
    auto_schedule boolean DEFAULT false NOT NULL,
    schedule_override boolean,
    schedule_override_until timestamp(3) without time zone
);


ALTER TABLE public.print_settings OWNER TO printsetu;

--
-- Name: printers; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.printers (
    id text NOT NULL,
    shop_id text NOT NULL,
    agent_id text NOT NULL,
    agent_key_hash text NOT NULL,
    printer_name text NOT NULL,
    driver_name text,
    status public."PrinterStatus" DEFAULT 'UNKNOWN'::public."PrinterStatus" NOT NULL,
    last_heartbeat_at timestamp(3) without time zone,
    capabilities_json jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    os_printer_name text
);


ALTER TABLE public.printers OWNER TO printsetu;

--
-- Name: qr_codes; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.qr_codes (
    id text NOT NULL,
    shop_id text NOT NULL,
    public_code text NOT NULL,
    target_path text NOT NULL,
    status public."QrStatus" DEFAULT 'ACTIVE'::public."QrStatus" NOT NULL,
    generated_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at timestamp(3) without time zone
);


ALTER TABLE public.qr_codes OWNER TO printsetu;

--
-- Name: refunds; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.refunds (
    id text NOT NULL,
    invoice_id text NOT NULL,
    amount numeric(10,2) NOT NULL,
    reason text NOT NULL,
    actor_user_id text,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.refunds OWNER TO printsetu;

--
-- Name: roles; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.roles (
    id text NOT NULL,
    name public."RoleName" NOT NULL,
    description text
);


ALTER TABLE public.roles OWNER TO printsetu;

--
-- Name: shop_subscriptions; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.shop_subscriptions (
    id text NOT NULL,
    shop_id text NOT NULL,
    plan_id text NOT NULL,
    cycle public."BillingCycle" DEFAULT 'MONTHLY'::public."BillingCycle" NOT NULL,
    status public."SubscriptionStatus" DEFAULT 'ACTIVE'::public."SubscriptionStatus" NOT NULL,
    start_date timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    current_period_start timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    current_period_end timestamp(3) without time zone NOT NULL,
    trial_ends_at timestamp(3) without time zone,
    grace_ends_at timestamp(3) without time zone,
    past_due_since timestamp(3) without time zone,
    auto_renew boolean DEFAULT true NOT NULL,
    gateway text DEFAULT 'MANUAL'::text NOT NULL,
    cancel_at_period_end boolean DEFAULT false NOT NULL,
    cancelled_at timestamp(3) without time zone,
    cancel_reason text,
    pending_plan_id text,
    pending_cycle public."BillingCycle",
    automation_paused boolean DEFAULT false NOT NULL,
    paused_until timestamp(3) without time zone,
    notification_channels jsonb,
    reminders_sent jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.shop_subscriptions OWNER TO printsetu;

--
-- Name: shops; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.shops (
    id text NOT NULL,
    shop_code text NOT NULL,
    name text NOT NULL,
    owner_name text NOT NULL,
    mobile text NOT NULL,
    email text NOT NULL,
    address text NOT NULL,
    city text NOT NULL,
    status public."ShopStatus" DEFAULT 'ACTIVE'::public."ShopStatus" NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    banner_key text,
    description text,
    logo_key text,
    opening_hours jsonb
);


ALTER TABLE public.shops OWNER TO printsetu;

--
-- Name: subscription_events; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.subscription_events (
    id text NOT NULL,
    shop_id text NOT NULL,
    type text NOT NULL,
    from_value text,
    to_value text,
    reason text,
    actor_user_id text,
    actor_name text,
    metadata jsonb,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.subscription_events OWNER TO printsetu;

--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.subscription_plans (
    id text NOT NULL,
    name text NOT NULL,
    description text,
    monthly_price numeric(10,2) NOT NULL,
    yearly_price numeric(10,2) NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    trial_days integer DEFAULT 0 NOT NULL,
    max_prints_per_month integer,
    max_tokens_per_day integer,
    max_printers integer,
    priority_support boolean DEFAULT false NOT NULL,
    analytics_access boolean DEFAULT false NOT NULL,
    highlights text[],
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    daily_price numeric(10,2) NOT NULL
);


ALTER TABLE public.subscription_plans OWNER TO printsetu;

--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.system_settings (
    key text NOT NULL,
    value_json jsonb NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.system_settings OWNER TO printsetu;

--
-- Name: users; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.users (
    id text NOT NULL,
    shop_id text,
    role_id text NOT NULL,
    name text NOT NULL,
    mobile text,
    email text NOT NULL,
    password_hash text,
    keycloak_user_id text,
    status public."UserStatus" DEFAULT 'ACTIVE'::public."UserStatus" NOT NULL,
    last_login_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(3) without time zone NOT NULL,
    current_password_enc text,
    must_change_password boolean DEFAULT false NOT NULL
);


ALTER TABLE public.users OWNER TO printsetu;

--
-- Name: print_jobs token_number; Type: DEFAULT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_jobs ALTER COLUMN token_number SET DEFAULT nextval('public.print_jobs_token_number_seq'::regclass);


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.audit_logs (id, actor_user_id, shop_id, action, entity_type, entity_id, ip, user_agent, metadata_json, created_at) FROM stdin;
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.documents (id, shop_id, original_name, s3_key, mime_type, size_bytes, page_count, color_pages, color_detection_confidence, status, uploaded_at, deleted_at, session_id) FROM stdin;
\.


--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.invoices (id, number, shop_id, plan_id, plan_name, cycle, kind, description, period_start, period_end, amount, currency, status, due_date, paid_at, payment_method, payment_reference, attempt_count, next_retry_at, last_failure, refunded_amount, created_at) FROM stdin;
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.notifications (id, shop_id, print_job_id, event_type, channel, destination, status, provider_ref, created_at, message) FROM stdin;
\.


--
-- Data for Name: pricing; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.pricing (id, shop_id, "paperSize", "colorMode", "sideMode", price_per_page, effective_from, active, created_at) FROM stdin;
\.


--
-- Data for Name: print_job_events; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_job_events (id, print_job_id, status, agent_attempt_id, message, created_at) FROM stdin;
\.


--
-- Data for Name: print_job_items; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_job_items (id, print_job_id, document_id, "paperSize", "colorMode", "sideMode", copies, page_count, billable_pages, amount, print_order, edit_state, rendered_at, rendered_s3_key) FROM stdin;
\.


--
-- Data for Name: print_jobs; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_jobs (id, shop_id, printer_id, quote_id, amount, currency, status, attempt_count, idempotency_key, queued_at, printed_at, failure_reason, status_token, created_at, updated_at, token_number) FROM stdin;
\.


--
-- Data for Name: print_quote_items; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_quote_items (id, quote_id, document_id, "paperSize", "colorMode", "sideMode", copies, page_count, billable_pages, amount, pricing_snapshot) FROM stdin;
\.


--
-- Data for Name: print_quotes; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_quotes (id, amount, currency, status_token_claim_id, expires_at, consumed_at, created_at, session_id) FROM stdin;
\.


--
-- Data for Name: print_sessions; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_sessions (id, shop_id, created_at) FROM stdin;
\.


--
-- Data for Name: print_settings; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_settings (id, shop_id, default_printer_id, retention_minutes, max_file_size, updated_at, document_preview_enabled, auto_accept_orders, notification_prefs, accepting_orders, auto_schedule, schedule_override, schedule_override_until) FROM stdin;
\.


--
-- Data for Name: printers; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.printers (id, shop_id, agent_id, agent_key_hash, printer_name, driver_name, status, last_heartbeat_at, capabilities_json, created_at, updated_at, os_printer_name) FROM stdin;
\.


--
-- Data for Name: qr_codes; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.qr_codes (id, shop_id, public_code, target_path, status, generated_at, revoked_at) FROM stdin;
\.


--
-- Data for Name: refunds; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.refunds (id, invoice_id, amount, reason, actor_user_id, created_at) FROM stdin;
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.roles (id, name, description) FROM stdin;
\.


--
-- Data for Name: shop_subscriptions; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.shop_subscriptions (id, shop_id, plan_id, cycle, status, start_date, current_period_start, current_period_end, trial_ends_at, grace_ends_at, past_due_since, auto_renew, gateway, cancel_at_period_end, cancelled_at, cancel_reason, pending_plan_id, pending_cycle, automation_paused, paused_until, notification_channels, reminders_sent, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: shops; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.shops (id, shop_code, name, owner_name, mobile, email, address, city, status, created_at, updated_at, banner_key, description, logo_key, opening_hours) FROM stdin;
\.


--
-- Data for Name: subscription_events; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.subscription_events (id, shop_id, type, from_value, to_value, reason, actor_user_id, actor_name, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: subscription_plans; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.subscription_plans (id, name, description, monthly_price, yearly_price, currency, trial_days, max_prints_per_month, max_tokens_per_day, max_printers, priority_support, analytics_access, highlights, is_active, sort_order, created_at, updated_at, daily_price) FROM stdin;
9cac4508-4969-44fa-8f6a-a66cba6bde81	Basic	For a single-counter shop getting started.	299.00	2990.00	INR	7	500	50	1	f	f	{"QR ordering page","Email reminders"}	t	1	2026-09-24 11:21:08.198	2026-09-24 11:21:08.198	9.97
829d77b5-b5bf-47d5-92b2-02f6f3c7cb7c	Standard	For busy shops that need more capacity and insights.	599.00	5990.00	INR	14	2000	200	2	f	t	{"QR ordering page","Email reminders"}	t	2	2026-09-24 11:21:08.198	2026-09-24 11:21:08.198	19.97
e3ce59ee-c892-4f8d-a1e3-6c68dd2606da	Premium	Unlimited printing with priority support.	999.00	9990.00	INR	14	\N	\N	5	t	t	{"QR ordering page","Email reminders","Dedicated onboarding"}	t	3	2026-09-24 11:21:08.198	2026-09-24 11:21:08.198	33.30
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.system_settings (key, value_json, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.users (id, shop_id, role_id, name, mobile, email, password_hash, keycloak_user_id, status, last_login_at, created_at, updated_at, current_password_enc, must_change_password) FROM stdin;
\.


--
-- Name: invoice_number_seq; Type: SEQUENCE SET; Schema: public; Owner: printsetu
--

SELECT pg_catalog.setval('public.invoice_number_seq', 1, false);


--
-- Name: print_jobs_token_number_seq; Type: SEQUENCE SET; Schema: public; Owner: printsetu
--

SELECT pg_catalog.setval('public.print_jobs_token_number_seq', 1, false);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: pricing pricing_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.pricing
    ADD CONSTRAINT pricing_pkey PRIMARY KEY (id);


--
-- Name: print_job_events print_job_events_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_job_events
    ADD CONSTRAINT print_job_events_pkey PRIMARY KEY (id);


--
-- Name: print_job_items print_job_items_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_job_items
    ADD CONSTRAINT print_job_items_pkey PRIMARY KEY (id);


--
-- Name: print_jobs print_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_pkey PRIMARY KEY (id);


--
-- Name: print_quote_items print_quote_items_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_quote_items
    ADD CONSTRAINT print_quote_items_pkey PRIMARY KEY (id);


--
-- Name: print_quotes print_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_quotes
    ADD CONSTRAINT print_quotes_pkey PRIMARY KEY (id);


--
-- Name: print_sessions print_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_sessions
    ADD CONSTRAINT print_sessions_pkey PRIMARY KEY (id);


--
-- Name: print_settings print_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_settings
    ADD CONSTRAINT print_settings_pkey PRIMARY KEY (id);


--
-- Name: printers printers_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_pkey PRIMARY KEY (id);


--
-- Name: qr_codes qr_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.qr_codes
    ADD CONSTRAINT qr_codes_pkey PRIMARY KEY (id);


--
-- Name: refunds refunds_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: shop_subscriptions shop_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.shop_subscriptions
    ADD CONSTRAINT shop_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: shops shops_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_pkey PRIMARY KEY (id);


--
-- Name: subscription_events subscription_events_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.subscription_events
    ADD CONSTRAINT subscription_events_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (key);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: audit_logs_entity_type_entity_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX audit_logs_entity_type_entity_id_idx ON public.audit_logs USING btree (entity_type, entity_id);


--
-- Name: audit_logs_shop_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX audit_logs_shop_id_idx ON public.audit_logs USING btree (shop_id);


--
-- Name: documents_session_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX documents_session_id_idx ON public.documents USING btree (session_id);


--
-- Name: documents_shop_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX documents_shop_id_idx ON public.documents USING btree (shop_id);


--
-- Name: documents_status_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX documents_status_idx ON public.documents USING btree (status);


--
-- Name: invoices_number_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX invoices_number_key ON public.invoices USING btree (number);


--
-- Name: invoices_shop_id_created_at_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX invoices_shop_id_created_at_idx ON public.invoices USING btree (shop_id, created_at);


--
-- Name: invoices_status_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX invoices_status_idx ON public.invoices USING btree (status);


--
-- Name: notifications_shop_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX notifications_shop_id_idx ON public.notifications USING btree (shop_id);


--
-- Name: pricing_shop_id_active_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX pricing_shop_id_active_idx ON public.pricing USING btree (shop_id, active);


--
-- Name: pricing_shop_id_paperSize_colorMode_sideMode_effective_from_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX "pricing_shop_id_paperSize_colorMode_sideMode_effective_from_key" ON public.pricing USING btree (shop_id, "paperSize", "colorMode", "sideMode", effective_from);


--
-- Name: print_job_events_print_job_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX print_job_events_print_job_id_idx ON public.print_job_events USING btree (print_job_id);


--
-- Name: print_job_items_document_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX print_job_items_document_id_idx ON public.print_job_items USING btree (document_id);


--
-- Name: print_job_items_print_job_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX print_job_items_print_job_id_idx ON public.print_job_items USING btree (print_job_id);


--
-- Name: print_jobs_idempotency_key_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX print_jobs_idempotency_key_key ON public.print_jobs USING btree (idempotency_key);


--
-- Name: print_jobs_quote_id_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX print_jobs_quote_id_key ON public.print_jobs USING btree (quote_id);


--
-- Name: print_jobs_shop_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX print_jobs_shop_id_idx ON public.print_jobs USING btree (shop_id);


--
-- Name: print_jobs_status_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX print_jobs_status_idx ON public.print_jobs USING btree (status);


--
-- Name: print_jobs_status_token_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX print_jobs_status_token_key ON public.print_jobs USING btree (status_token);


--
-- Name: print_jobs_token_number_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX print_jobs_token_number_key ON public.print_jobs USING btree (token_number);


--
-- Name: print_quote_items_document_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX print_quote_items_document_id_idx ON public.print_quote_items USING btree (document_id);


--
-- Name: print_quote_items_quote_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX print_quote_items_quote_id_idx ON public.print_quote_items USING btree (quote_id);


--
-- Name: print_quotes_session_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX print_quotes_session_id_idx ON public.print_quotes USING btree (session_id);


--
-- Name: print_quotes_status_token_claim_id_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX print_quotes_status_token_claim_id_key ON public.print_quotes USING btree (status_token_claim_id);


--
-- Name: print_sessions_shop_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX print_sessions_shop_id_idx ON public.print_sessions USING btree (shop_id);


--
-- Name: print_settings_shop_id_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX print_settings_shop_id_key ON public.print_settings USING btree (shop_id);


--
-- Name: printers_agent_id_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX printers_agent_id_key ON public.printers USING btree (agent_id);


--
-- Name: printers_shop_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX printers_shop_id_idx ON public.printers USING btree (shop_id);


--
-- Name: qr_codes_public_code_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX qr_codes_public_code_key ON public.qr_codes USING btree (public_code);


--
-- Name: qr_codes_shop_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX qr_codes_shop_id_idx ON public.qr_codes USING btree (shop_id);


--
-- Name: refunds_invoice_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX refunds_invoice_id_idx ON public.refunds USING btree (invoice_id);


--
-- Name: roles_name_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);


--
-- Name: shop_subscriptions_current_period_end_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX shop_subscriptions_current_period_end_idx ON public.shop_subscriptions USING btree (current_period_end);


--
-- Name: shop_subscriptions_shop_id_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX shop_subscriptions_shop_id_key ON public.shop_subscriptions USING btree (shop_id);


--
-- Name: shop_subscriptions_status_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX shop_subscriptions_status_idx ON public.shop_subscriptions USING btree (status);


--
-- Name: shops_shop_code_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX shops_shop_code_key ON public.shops USING btree (shop_code);


--
-- Name: subscription_events_shop_id_created_at_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX subscription_events_shop_id_created_at_idx ON public.subscription_events USING btree (shop_id, created_at);


--
-- Name: subscription_events_type_created_at_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX subscription_events_type_created_at_idx ON public.subscription_events USING btree (type, created_at);


--
-- Name: subscription_plans_name_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX subscription_plans_name_key ON public.subscription_plans USING btree (name);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: users_keycloak_user_id_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX users_keycloak_user_id_key ON public.users USING btree (keycloak_user_id);


--
-- Name: users_shop_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX users_shop_id_idx ON public.users USING btree (shop_id);


--
-- Name: audit_logs audit_logs_actor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_actor_user_id_fkey FOREIGN KEY (actor_user_id) REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.print_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: documents documents_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: invoices invoices_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: invoices invoices_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: notifications notifications_print_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_print_job_id_fkey FOREIGN KEY (print_job_id) REFERENCES public.print_jobs(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notifications notifications_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pricing pricing_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.pricing
    ADD CONSTRAINT pricing_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: print_job_events print_job_events_print_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_job_events
    ADD CONSTRAINT print_job_events_print_job_id_fkey FOREIGN KEY (print_job_id) REFERENCES public.print_jobs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: print_job_items print_job_items_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_job_items
    ADD CONSTRAINT print_job_items_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: print_job_items print_job_items_print_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_job_items
    ADD CONSTRAINT print_job_items_print_job_id_fkey FOREIGN KEY (print_job_id) REFERENCES public.print_jobs(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: print_jobs print_jobs_printer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_printer_id_fkey FOREIGN KEY (printer_id) REFERENCES public.printers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: print_jobs print_jobs_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.print_quotes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: print_jobs print_jobs_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: print_quote_items print_quote_items_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_quote_items
    ADD CONSTRAINT print_quote_items_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: print_quote_items print_quote_items_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_quote_items
    ADD CONSTRAINT print_quote_items_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.print_quotes(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: print_quotes print_quotes_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_quotes
    ADD CONSTRAINT print_quotes_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.print_sessions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: print_sessions print_sessions_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_sessions
    ADD CONSTRAINT print_sessions_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: print_settings print_settings_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_settings
    ADD CONSTRAINT print_settings_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: printers printers_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.printers
    ADD CONSTRAINT printers_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: qr_codes qr_codes_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.qr_codes
    ADD CONSTRAINT qr_codes_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: refunds refunds_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.refunds
    ADD CONSTRAINT refunds_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: shop_subscriptions shop_subscriptions_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.shop_subscriptions
    ADD CONSTRAINT shop_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: shop_subscriptions shop_subscriptions_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.shop_subscriptions
    ADD CONSTRAINT shop_subscriptions_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: subscription_events subscription_events_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.subscription_events
    ADD CONSTRAINT subscription_events_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: users users_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: users users_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: printsetu
--

REVOKE USAGE ON SCHEMA public FROM PUBLIC;


--
-- PostgreSQL database dump complete
--

\unrestrict GOnYZeHWauo7FTAE8kyaaxSiF5PuKMMAe5C1uLD94PRP7as4eFvQGCEhgGQ8zlt

