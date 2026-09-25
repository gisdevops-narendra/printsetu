--
-- PostgreSQL database dump
--

\restrict tdczchdwF1ExZ7EskBkMaX8q6ecdfBesqGqDBLqaETPTW7OMnQYuLytHqT1k7i5

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
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
-- Name: _prisma_migrations; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);


ALTER TABLE public._prisma_migrations OWNER TO printsetu;

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
-- Name: pricing_tiers; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.pricing_tiers (
    id text NOT NULL,
    shop_id text NOT NULL,
    "paperSize" public."PaperSize" NOT NULL,
    "colorMode" public."ColorMode" NOT NULL,
    "sideMode" public."SideMode" NOT NULL,
    min_pages integer NOT NULL,
    max_pages integer,
    price_per_page numeric(10,2) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.pricing_tiers OWNER TO printsetu;

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
    token_number integer NOT NULL,
    priced boolean DEFAULT false NOT NULL
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
    session_id text NOT NULL,
    priced boolean DEFAULT false NOT NULL
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
    schedule_override_until timestamp(3) without time zone,
    pricing_enabled boolean DEFAULT false NOT NULL
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
    must_change_password boolean DEFAULT false NOT NULL,
    language text DEFAULT 'en'::text NOT NULL
);


ALTER TABLE public.users OWNER TO printsetu;

--
-- Name: print_jobs token_number; Type: DEFAULT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_jobs ALTER COLUMN token_number SET DEFAULT nextval('public.print_jobs_token_number_seq'::regclass);


--
-- Data for Name: _prisma_migrations; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) FROM stdin;
f6bd567f-9f4c-48c6-acdc-aa0aa785ca00	26c8b3726b9987fa3a12d2c71fecd53ca7878f2ce410712b6559998f6c3b7497	2026-09-24 11:37:53.666274+00	20260917102604_init	\N	\N	2026-09-24 11:37:53.38113+00	1
ece7fc4c-fef9-4ab5-a47e-bcbab9bb0f0e	a516a5fc65b792151237870fb6accb80ea2fa353e92aba0e39bbb408a187cd5a	2026-09-24 11:37:54.017975+00	20260924120000_pricing_tiers	\N	\N	2026-09-24 11:37:53.99831+00	1
a16b68ef-686c-4332-86a6-e724bc4c2faf	c33d78c6d603d2b01cab0a7c0bb3e655c0dd96204800c271c85f987f8fea33f2	2026-09-24 11:37:53.67593+00	20260917185849_add_document_preview_enabled	\N	\N	2026-09-24 11:37:53.668749+00	1
a7d89ba8-a05b-45a8-8e41-9e38bd087633	b92a40f4c7ce5fcae3d7491759d09f642f112c9fed7d78a6df65307f8e685100	2026-09-24 11:37:53.740009+00	20260918090000_add_print_job_token_number	\N	\N	2026-09-24 11:37:53.678193+00	1
2ae60549-e73b-4eb1-84ee-d97cfe72039f	f22524992c680af31c8484739046f0fedee8ae3e5614201c272c37629879aa80	2026-09-24 11:37:53.813107+00	20260918100000_multi_document_print_jobs	\N	\N	2026-09-24 11:37:53.744944+00	1
050bbd7d-7024-490d-bccb-174b41cf4322	9d6fbc57e557352ef8f2750334f3a1f5d32d8529d7872de448c3ebf9ae43322b	2026-09-24 12:41:42.86504+00	20260924140000_user_language	\N	\N	2026-09-24 12:41:42.85822+00	1
f29d7bdc-a45b-41f7-9cf6-fd1f63442e2d	238f0b194beedec1955da1225b4fcb5bb4e2f7b146b2e8778a0bf192ca744713	2026-09-24 11:37:53.822991+00	20260918110000_add_print_job_item_edit_state	\N	\N	2026-09-24 11:37:53.815715+00	1
30839ad2-dc67-48e2-80c3-e1f785c68bc3	75b5bac1502d42c6e6acd9e620b6246db3278b7472e9192105aace19d43bd655	2026-09-24 11:37:53.831901+00	20260919090000_shop_profile_customization	\N	\N	2026-09-24 11:37:53.825194+00	1
ff62d6ab-c983-4910-b2a5-4976d7b128aa	fe50491c542ee0467d942358a64a3b8872ecf417349892371bea4bb3096d1dc2	2026-09-24 11:37:53.950172+00	20260920090000_subscriptions_billing	\N	\N	2026-09-24 11:37:53.834143+00	1
36117c13-ce28-4357-9167-66757fc68127	8d3998cf6961d3ddc3c7d1444ecd20dae584d87857cc995ff7f3c981293ad975	2026-09-25 04:50:52.83011+00	20260925100000_pricing_toggle	\N	\N	2026-09-25 04:50:52.810098+00	1
ac30ef46-cc35-41aa-8385-c4603b4b3205	5fe49c486ba8f35e3d4fb35c7d57197f40ef3df28fe6a32f075fa17a32d59f7e	2026-09-24 11:37:53.957645+00	20260921090000_shop_accepting_orders	\N	\N	2026-09-24 11:37:53.952315+00	1
81f75664-c847-408a-9157-327611e6ab97	f3e9cf2f78a8f141d4a7dbbd7ef3d83ea473acdcea67d217c46fd59275faa231	2026-09-24 11:37:53.964701+00	20260922152737_add_user_password_visibility	\N	\N	2026-09-24 11:37:53.959241+00	1
e5f6311c-4cc2-40d9-8c07-510ca328f4ca	ffaaf514cc0884165344391f46fb35347947cd52b505f9058810406228d27ddb	2026-09-24 11:37:53.971798+00	20260922155446_printer_removed_status	\N	\N	2026-09-24 11:37:53.96654+00	1
221bd47b-7ff4-4c83-ad43-70368d9135bc	156da1aeafb69f595e84353d65c5dba032509a706bd48d242fd99b1dbcaa4b2e	2026-09-24 11:37:53.979733+00	20260923090000_printer_os_printer_name	\N	\N	2026-09-24 11:37:53.973923+00	1
e9874503-8a95-4065-90d4-8d1f9d8bafbd	f63d9d953545da016ad552a1cf8c73732c40ba8f81c9908cadccea9f005d2534	2026-09-24 11:37:53.988477+00	20260924090000_daily_billing_cycle	\N	\N	2026-09-24 11:37:53.981656+00	1
5c31cfba-4e45-4e17-8bc0-f0be183bcfaf	6e7903a0e8c6b16b7098c9f17f457fecc0e4d390e3a7eb5929e2b1a02e8fd012	2026-09-24 11:37:53.99648+00	20260924100000_shop_auto_schedule	\N	\N	2026-09-24 11:37:53.990336+00	1
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.audit_logs (id, actor_user_id, shop_id, action, entity_type, entity_id, ip, user_agent, metadata_json, created_at) FROM stdin;
e36b4b0d-501f-4d07-b848-1abd228f500f	d334c7bc-8b13-4884-a77e-8ef53cd2e502	33333333-3333-3333-3333-333333333333	SHOP_SETTINGS_UPDATED	PrintSettings	33333333-3333-3333-3333-333333333333	\N	\N	{"fields": ["acceptingOrders"]}	2026-09-24 12:28:30.481
813dfdec-1050-48a2-b200-8ad3b0459060	d334c7bc-8b13-4884-a77e-8ef53cd2e502	33333333-3333-3333-3333-333333333333	SHOP_SETTINGS_UPDATED	PrintSettings	33333333-3333-3333-3333-333333333333	\N	\N	{"fields": ["acceptingOrders"]}	2026-09-24 12:28:31.649
9ede9b92-b052-4c33-897f-f43c4c2be312	d334c7bc-8b13-4884-a77e-8ef53cd2e502	33333333-3333-3333-3333-333333333333	SHOP_SETTINGS_UPDATED	PrintSettings	33333333-3333-3333-3333-333333333333	\N	\N	{"fields": ["acceptingOrders"]}	2026-09-24 12:28:32.168
9b5b9a76-3b5a-44d5-8044-284b0409341a	d334c7bc-8b13-4884-a77e-8ef53cd2e502	33333333-3333-3333-3333-333333333333	SHOP_SETTINGS_UPDATED	PrintSettings	33333333-3333-3333-3333-333333333333	\N	\N	{"fields": ["acceptingOrders"]}	2026-09-24 12:28:32.688
dfb7e2f9-2ea0-47d7-a067-ce2afd62ef98	d334c7bc-8b13-4884-a77e-8ef53cd2e502	33333333-3333-3333-3333-333333333333	SHOP_SETTINGS_UPDATED	PrintSettings	33333333-3333-3333-3333-333333333333	\N	\N	{"fields": ["pricingEnabled"]}	2026-09-25 04:53:40.083
e813ab97-a1c3-406d-890d-5c7acca9807c	d334c7bc-8b13-4884-a77e-8ef53cd2e502	33333333-3333-3333-3333-333333333333	SHOP_SETTINGS_UPDATED	PrintSettings	33333333-3333-3333-3333-333333333333	\N	\N	{"fields": ["pricingEnabled"]}	2026-09-25 04:53:43.493
9ab94c59-85e9-4c43-b50f-84a3470061f0	d334c7bc-8b13-4884-a77e-8ef53cd2e502	33333333-3333-3333-3333-333333333333	SHOP_SETTINGS_UPDATED	PrintSettings	33333333-3333-3333-3333-333333333333	\N	\N	{"fields": ["acceptingOrders"]}	2026-09-25 05:38:19.834
8ad0b4c9-709a-49ee-9457-7c3efd9ff830	d334c7bc-8b13-4884-a77e-8ef53cd2e502	33333333-3333-3333-3333-333333333333	SHOP_SETTINGS_UPDATED	PrintSettings	33333333-3333-3333-3333-333333333333	\N	\N	{"fields": ["acceptingOrders"]}	2026-09-25 05:38:20.759
8b2b4892-7f8f-4b30-83c1-c95f351c07c4	d334c7bc-8b13-4884-a77e-8ef53cd2e502	33333333-3333-3333-3333-333333333333	SHOP_SETTINGS_UPDATED	PrintSettings	33333333-3333-3333-3333-333333333333	\N	\N	{"fields": ["acceptingOrders"]}	2026-09-25 05:38:21.341
19f6547b-d000-4661-827e-aa3a7ad6ab93	d334c7bc-8b13-4884-a77e-8ef53cd2e502	33333333-3333-3333-3333-333333333333	SHOP_SETTINGS_UPDATED	PrintSettings	33333333-3333-3333-3333-333333333333	\N	\N	{"fields": ["acceptingOrders"]}	2026-09-25 05:38:22.272
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.documents (id, shop_id, original_name, s3_key, mime_type, size_bytes, page_count, color_pages, color_detection_confidence, status, uploaded_at, deleted_at, session_id) FROM stdin;
2c255104-aa88-46d8-a054-e833ede39bd5	33333333-3333-3333-3333-333333333333	three.pdf	33333333-3333-3333-3333-333333333333/2c255104-aa88-46d8-a054-e833ede39bd5/three.pdf	application/pdf	1449	3	0	HIGH	PRINT_ELIGIBLE	2026-09-24 11:51:25.114	\N	5f59d006-88f6-48b9-8350-5bb54bc14669
042da308-d860-486c-a4be-1aea55b34bdf	33333333-3333-3333-3333-333333333333	four.pdf	33333333-3333-3333-3333-333333333333/042da308-d860-486c-a4be-1aea55b34bdf/four.pdf	application/pdf	1790	4	0	HIGH	PRINT_ELIGIBLE	2026-09-24 11:51:25.182	\N	5f59d006-88f6-48b9-8350-5bb54bc14669
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
f484d59f-4006-439b-ae43-c218c55d7a97	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-24 11:51:25.12	\N
83bdbb57-6027-4890-b305-0e2355abf2ed	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-24 11:51:25.185	\N
\.


--
-- Data for Name: pricing; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.pricing (id, shop_id, "paperSize", "colorMode", "sideMode", price_per_page, effective_from, active, created_at) FROM stdin;
43b337c1-90ef-4f60-9299-fe9498a6963d	33333333-3333-3333-3333-333333333333	A4	BW	SIMPLEX	2.00	2026-09-24 11:37:55.358	t	2026-09-24 11:37:55.358
003e4d2d-6e90-4120-8680-ec8708f5a8c0	33333333-3333-3333-3333-333333333333	A4	BW	DUPLEX	1.50	2026-09-24 11:37:55.361	t	2026-09-24 11:37:55.361
b5244955-ef82-4b97-8736-3d0d523fc8ec	33333333-3333-3333-3333-333333333333	A4	COLOR	SIMPLEX	8.00	2026-09-24 11:37:55.363	t	2026-09-24 11:37:55.363
f84db8e0-0f68-4a3b-a339-91e03f0df797	33333333-3333-3333-3333-333333333333	A4	COLOR	DUPLEX	7.00	2026-09-24 11:37:55.365	t	2026-09-24 11:37:55.365
754c592d-25e4-4a1b-ad56-119102700e48	33333333-3333-3333-3333-333333333333	A3	BW	SIMPLEX	4.00	2026-09-24 11:37:55.367	t	2026-09-24 11:37:55.367
9e489f2e-9c60-4e10-8325-ca71645c56ab	33333333-3333-3333-3333-333333333333	A3	COLOR	SIMPLEX	14.00	2026-09-24 11:37:55.37	t	2026-09-24 11:37:55.37
4b80db39-f960-4983-ba2e-efff99eb3810	33333333-3333-3333-3333-333333333333	LEGAL	BW	SIMPLEX	3.00	2026-09-24 11:37:55.372	t	2026-09-24 11:37:55.372
6d73e5d8-f5d3-428a-8c79-b0b542d13f5e	33333333-3333-3333-3333-333333333333	LETTER	BW	SIMPLEX	2.00	2026-09-24 11:37:55.374	t	2026-09-24 11:37:55.374
\.


--
-- Data for Name: pricing_tiers; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.pricing_tiers (id, shop_id, "paperSize", "colorMode", "sideMode", min_pages, max_pages, price_per_page, active, created_at) FROM stdin;
66abcffe-c5ed-4567-986e-04b434639619	33333333-3333-3333-3333-333333333333	A4	BW	DUPLEX	100	1000	1.00	t	2026-09-24 11:43:14.396
\.


--
-- Data for Name: print_job_events; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_job_events (id, print_job_id, status, agent_attempt_id, message, created_at) FROM stdin;
8087b53a-445d-4c42-bbdb-126cddb1dd06	d500ff96-e95c-4fe9-a721-06d0f627e2e1	CREATED	\N	\N	2026-09-24 11:51:25.281
4e6943f3-17c4-49c7-b73d-f038aca94091	d500ff96-e95c-4fe9-a721-06d0f627e2e1	PRINT_ELIGIBLE	\N	\N	2026-09-24 11:51:25.285
\.


--
-- Data for Name: print_job_items; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_job_items (id, print_job_id, document_id, "paperSize", "colorMode", "sideMode", copies, page_count, billable_pages, amount, print_order, edit_state, rendered_at, rendered_s3_key) FROM stdin;
72596d53-2034-4cf8-8f9f-2b6b88da6e8b	d500ff96-e95c-4fe9-a721-06d0f627e2e1	2c255104-aa88-46d8-a054-e833ede39bd5	A4	BW	SIMPLEX	1	3	3	6.00	0	\N	\N	\N
5db26fee-a4b4-4b2d-89c8-e6e0dacf63f9	d500ff96-e95c-4fe9-a721-06d0f627e2e1	042da308-d860-486c-a4be-1aea55b34bdf	A4	COLOR	SIMPLEX	1	4	4	32.00	1	\N	\N	\N
\.


--
-- Data for Name: print_jobs; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_jobs (id, shop_id, printer_id, quote_id, amount, currency, status, attempt_count, idempotency_key, queued_at, printed_at, failure_reason, status_token, created_at, updated_at, token_number, priced) FROM stdin;
d500ff96-e95c-4fe9-a721-06d0f627e2e1	33333333-3333-3333-3333-333333333333	\N	51e33c2e-3cca-4f9a-859c-4b2a8c89b24a	38.00	INR	PRINT_ELIGIBLE	0	quote:51e33c2e-3cca-4f9a-859c-4b2a8c89b24a	\N	\N	\N	eyJzaG9wSWQiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJwcmludEpvYklkIjoiZDUwMGZmOTYtZTk1Yy00ZmU5LWE3MjEtMDZkMGY2MjdlMmUxIiwiZXhwIjoxNzkwNDIzNDg1fQ.DR7hCCM7DPbxVoGaPMHqmU-k95yvkpG2P9G5bK0Bq1k	2026-09-24 11:51:25.278	2026-09-24 11:51:25.285	1	t
\.


--
-- Data for Name: print_quote_items; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_quote_items (id, quote_id, document_id, "paperSize", "colorMode", "sideMode", copies, page_count, billable_pages, amount, pricing_snapshot) FROM stdin;
998e4137-6d6b-40d2-8de8-75131e503cac	51e33c2e-3cca-4f9a-859c-4b2a8c89b24a	2c255104-aa88-46d8-a054-e833ede39bd5	A4	BW	SIMPLEX	1	3	3	6.00	{"tier": null, "sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4", "pricingId": "43b337c1-90ef-4f60-9299-fe9498a6963d", "pricePerPage": "2.00", "effectiveFrom": "2026-09-24T11:37:55.358Z", "basePricePerPage": "2.00", "comboBillablePages": 3}
9d5e9f25-07e2-4d3d-8384-ea2cd061b50f	51e33c2e-3cca-4f9a-859c-4b2a8c89b24a	042da308-d860-486c-a4be-1aea55b34bdf	A4	COLOR	SIMPLEX	1	4	4	32.00	{"tier": null, "sideMode": "SIMPLEX", "colorMode": "COLOR", "paperSize": "A4", "pricingId": "b5244955-ef82-4b97-8736-3d0d523fc8ec", "pricePerPage": "8.00", "effectiveFrom": "2026-09-24T11:37:55.363Z", "basePricePerPage": "8.00", "comboBillablePages": 4}
\.


--
-- Data for Name: print_quotes; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_quotes (id, amount, currency, status_token_claim_id, expires_at, consumed_at, created_at, session_id, priced) FROM stdin;
51e33c2e-3cca-4f9a-859c-4b2a8c89b24a	38.00	INR	31afb254-bee9-4e08-b043-bbaf3a42437d	2026-09-24 12:06:25.261	2026-09-24 11:51:25.281	2026-09-24 11:51:25.262	5f59d006-88f6-48b9-8350-5bb54bc14669	t
\.


--
-- Data for Name: print_sessions; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_sessions (id, shop_id, created_at) FROM stdin;
5f59d006-88f6-48b9-8350-5bb54bc14669	33333333-3333-3333-3333-333333333333	2026-09-24 11:51:25.081
\.


--
-- Data for Name: print_settings; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_settings (id, shop_id, default_printer_id, retention_minutes, max_file_size, updated_at, document_preview_enabled, auto_accept_orders, notification_prefs, accepting_orders, auto_schedule, schedule_override, schedule_override_until, pricing_enabled) FROM stdin;
b7e321af-dd11-41c8-8498-fd437c0a35dd	33333333-3333-3333-3333-333333333333	\N	30	26214400	2026-09-25 05:38:22.269	f	f	\N	t	f	\N	\N	f
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
ca12671f-a2b1-4fd3-8a27-a0bfd774c323	33333333-3333-3333-3333-333333333333	demoShopQR001	/s/demoShopQR001	ACTIVE	2026-09-24 11:37:55.377	\N
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
96a756de-75e5-4095-8cd1-9cca2f2c66ac	ADMIN	Platform administrator
9712573f-ae80-47dc-9120-7d0291ca9458	SHOPKEEPER	Shop-level operator
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
33333333-3333-3333-3333-333333333333	SHOP-DEMO001	PrintSetu Demo Shop	Demo Owner	9999999999	demo.shop@printsetu.local	1st Floor, MG Road	Ahmedabad	ACTIVE	2026-09-24 11:37:55.343	2026-09-24 11:37:55.343	\N	\N	\N	\N
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
a492b2da-6790-48dc-87ee-6ba5a165f68f	Basic	For a single-counter shop getting started.	299.00	2990.00	INR	7	500	50	1	f	f	{"QR ordering page","Email reminders"}	t	1	2026-09-24 11:37:53.836	2026-09-24 11:37:53.836	9.97
859966fb-bddc-4da5-b768-46b8761cd941	Standard	For busy shops that need more capacity and insights.	599.00	5990.00	INR	14	2000	200	2	f	t	{"QR ordering page","Email reminders"}	t	2	2026-09-24 11:37:53.836	2026-09-24 11:37:53.836	19.97
c6b1679d-eb97-4134-9624-fb19e32ea395	Premium	Unlimited printing with priority support.	999.00	9990.00	INR	14	\N	\N	5	t	t	{"QR ordering page","Email reminders","Dedicated onboarding"}	t	3	2026-09-24 11:37:53.836	2026-09-24 11:37:53.836	33.30
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.system_settings (key, value_json, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.users (id, shop_id, role_id, name, mobile, email, password_hash, keycloak_user_id, status, last_login_at, created_at, updated_at, current_password_enc, must_change_password, language) FROM stdin;
a0e0a558-b330-4d52-8729-e1ba080ea179	\N	96a756de-75e5-4095-8cd1-9cca2f2c66ac	PrintSetu Admin	9000000001	admin.demo@printsetu.local	\N	11111111-1111-1111-1111-111111111111	ACTIVE	2026-09-25 05:38:10.432	2026-09-24 11:37:55.35	2026-09-25 05:38:10.433	\N	f	en
d334c7bc-8b13-4884-a77e-8ef53cd2e502	33333333-3333-3333-3333-333333333333	9712573f-ae80-47dc-9120-7d0291ca9458	PrintSetu Shopkeeper	9000000002	shopkeeper.demo@printsetu.local	\N	22222222-2222-2222-2222-222222222222	ACTIVE	2026-09-25 05:39:01.014	2026-09-24 11:37:55.353	2026-09-25 05:39:01.015	\N	f	gu
\.


--
-- Name: invoice_number_seq; Type: SEQUENCE SET; Schema: public; Owner: printsetu
--

SELECT pg_catalog.setval('public.invoice_number_seq', 1, false);


--
-- Name: print_jobs_token_number_seq; Type: SEQUENCE SET; Schema: public; Owner: printsetu
--

SELECT pg_catalog.setval('public.print_jobs_token_number_seq', 1, true);


--
-- Name: _prisma_migrations _prisma_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public._prisma_migrations
    ADD CONSTRAINT _prisma_migrations_pkey PRIMARY KEY (id);


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
-- Name: pricing_tiers pricing_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.pricing_tiers
    ADD CONSTRAINT pricing_tiers_pkey PRIMARY KEY (id);


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
-- Name: pricing_tiers_shop_id_active_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX pricing_tiers_shop_id_active_idx ON public.pricing_tiers USING btree (shop_id, active);


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
-- Name: pricing_tiers pricing_tiers_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.pricing_tiers
    ADD CONSTRAINT pricing_tiers_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


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

\unrestrict tdczchdwF1ExZ7EskBkMaX8q6ecdfBesqGqDBLqaETPTW7OMnQYuLytHqT1k7i5

