--
-- PostgreSQL database dump
--

\restrict 8oujVfrVgd5HE9bUhc5jdhkcdddMM6CDMM4FUjud1brmquPlG9VL0vvY0pNgCIi

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
    'PRINT_FAILED'
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
    'UNKNOWN'
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
    deleted_at timestamp(3) without time zone
);


ALTER TABLE public.documents OWNER TO printsetu;

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
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
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
-- Name: print_jobs; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.print_jobs (
    id text NOT NULL,
    shop_id text NOT NULL,
    document_id text NOT NULL,
    printer_id text,
    quote_id text,
    options_json jsonb NOT NULL,
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
-- Name: print_quotes; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.print_quotes (
    id text NOT NULL,
    document_id text NOT NULL,
    "paperSize" public."PaperSize" NOT NULL,
    "colorMode" public."ColorMode" NOT NULL,
    "sideMode" public."SideMode" NOT NULL,
    copies integer NOT NULL,
    page_count integer NOT NULL,
    billable_pages integer NOT NULL,
    amount numeric(10,2) NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    pricing_snapshot jsonb NOT NULL,
    status_token_claim_id text NOT NULL,
    expires_at timestamp(3) without time zone NOT NULL,
    consumed_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


ALTER TABLE public.print_quotes OWNER TO printsetu;

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
    document_preview_enabled boolean DEFAULT false NOT NULL
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
    updated_at timestamp(3) without time zone NOT NULL
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
-- Name: roles; Type: TABLE; Schema: public; Owner: printsetu
--

CREATE TABLE public.roles (
    id text NOT NULL,
    name public."RoleName" NOT NULL,
    description text
);


ALTER TABLE public.roles OWNER TO printsetu;

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
    updated_at timestamp(3) without time zone NOT NULL
);


ALTER TABLE public.shops OWNER TO printsetu;

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
    updated_at timestamp(3) without time zone NOT NULL
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
a5ce5a47-9140-4df5-a30f-a1ba18f78b5f	6b4c47f27092ae5e7c12484d5f4c4ec24f4672402fc45a3a4f5a43dc7c24b687	2026-09-17 15:20:19.250842+00	20260917102604_init	\N	\N	2026-09-17 15:20:18.979229+00	1
8b45f92f-f943-464e-b95e-e7f3134f19dc	c33d78c6d603d2b01cab0a7c0bb3e655c0dd96204800c271c85f987f8fea33f2	2026-09-17 18:58:49.60344+00	20260917185849_add_document_preview_enabled	\N	\N	2026-09-17 18:58:49.474756+00	1
2856e584-de40-4b3c-92be-d305387eafb9	b92a40f4c7ce5fcae3d7491759d09f642f112c9fed7d78a6df65307f8e685100	2026-09-18 03:39:42.053715+00	20260918090000_add_print_job_token_number	\N	\N	2026-09-18 03:39:41.99792+00	1
\.


--
-- Data for Name: audit_logs; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.audit_logs (id, actor_user_id, shop_id, action, entity_type, entity_id, ip, user_agent, metadata_json, created_at) FROM stdin;
7377317c-f02a-48ea-bb54-a5c6ac064097	49ef9744-f036-43b8-8ba1-357e041088d0	\N	USER_DISABLED	user	8177ff11-d97e-44a1-9fe6-49c81e7159ca	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36	\N	2026-09-17 15:56:54.245
f786e8e6-ebc7-42b4-acfa-0c144d9a2d73	49ef9744-f036-43b8-8ba1-357e041088d0	\N	USER_ENABLED	user	8177ff11-d97e-44a1-9fe6-49c81e7159ca	127.0.0.1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36	\N	2026-09-17 15:56:58.183
a7cba4ef-c77a-42ad-97f7-9282a6d1b695	49ef9744-f036-43b8-8ba1-357e041088d0	33333333-3333-3333-3333-333333333333	SHOP_SETTINGS_UPDATED	print_settings	a360e764-b1fe-44be-bfd7-02c3a58ff42f	127.0.0.1	curl/8.2.1	{"documentPreviewEnabled": true}	2026-09-17 19:04:33.192
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.documents (id, shop_id, original_name, s3_key, mime_type, size_bytes, page_count, color_pages, color_detection_confidence, status, uploaded_at, deleted_at) FROM stdin;
efb49e0d-9790-4497-92fa-ed402e5968fb	33333333-3333-3333-3333-333333333333	IMG-20260916-WA0000(1).jpg	33333333-3333-3333-3333-333333333333/efb49e0d-9790-4497-92fa-ed402e5968fb/IMG-20260916-WA0000_1_.jpg	image/jpeg	97658	\N	\N	\N	ANALYSIS_FAILED	2026-09-17 17:27:32.761	\N
d03576dc-9ca0-4b1a-8b44-9d3ce962b523	33333333-3333-3333-3333-333333333333	Admit Card (1).pdf	33333333-3333-3333-3333-333333333333/d03576dc-9ca0-4b1a-8b44-9d3ce962b523/Admit_Card__1_.pdf	application/pdf	217039	\N	\N	\N	ANALYSIS_FAILED	2026-09-17 17:28:09.925	\N
2c6c3ba6-6cd1-489f-b187-5a9d787de424	33333333-3333-3333-3333-333333333333	Admit Card (1).pdf	33333333-3333-3333-3333-333333333333/2c6c3ba6-6cd1-489f-b187-5a9d787de424/Admit_Card__1_.pdf	application/pdf	217039	\N	\N	\N	ANALYSIS_FAILED	2026-09-17 17:31:34.96	\N
35b047a2-2c21-450a-bf20-4594c323526a	33333333-3333-3333-3333-333333333333	Screenshot_2026-09-17-17-47-28-52_5233d373fa6d7def08ced41dadfd17d1.jpg	33333333-3333-3333-3333-333333333333/35b047a2-2c21-450a-bf20-4594c323526a/Screenshot_2026-09-17-17-47-28-52_5233d373fa6d7def08ced41dadfd17d1.jpg	image/jpeg	395593	\N	\N	\N	ANALYSIS_FAILED	2026-09-17 17:31:58.747	\N
74d29994-c0a1-450e-aa7c-0f6f92a2a396	33333333-3333-3333-3333-333333333333	test.pdf	33333333-3333-3333-3333-333333333333/74d29994-c0a1-450e-aa7c-0f6f92a2a396/test.pdf	application/pdf	237	1	0	HIGH	PROCESSED	2026-09-17 17:33:28.526	\N
87d0df23-ce80-4352-92cc-d535ee00d06c	33333333-3333-3333-3333-333333333333	Admit Card (1).pdf	33333333-3333-3333-3333-333333333333/87d0df23-ce80-4352-92cc-d535ee00d06c/Admit_Card__1_.pdf	application/pdf	217039	2	1	HIGH	PRINT_ELIGIBLE	2026-09-17 17:34:06.762	\N
08b82e0d-61db-4bb7-9356-c204162ddf60	33333333-3333-3333-3333-333333333333	upload-test.pdf	33333333-3333-3333-3333-333333333333/08b82e0d-61db-4bb7-9356-c204162ddf60/upload-test.pdf	application/pdf	237	1	0	HIGH	PROCESSED	2026-09-17 19:06:28.643	\N
27b9f64b-bbff-4663-8e9e-9157fa16bc4b	33333333-3333-3333-3333-333333333333	Screenshot_2026-09-17-16-40-05-58_1c337646f29875672b5a61192b9010f9.jpg	33333333-3333-3333-3333-333333333333/27b9f64b-bbff-4663-8e9e-9157fa16bc4b/Screenshot_2026-09-17-16-40-05-58_1c337646f29875672b5a61192b9010f9.jpg	image/jpeg	1393196	1	1	LOW	PRINT_ELIGIBLE	2026-09-17 19:13:59.299	\N
21dc33d9-4831-439d-8515-343608ca24de	33333333-3333-3333-3333-333333333333	IMG20260917233840.jpg	33333333-3333-3333-3333-333333333333/21dc33d9-4831-439d-8515-343608ca24de/IMG20260917233840.jpg	image/jpeg	9729168	1	1	LOW	PRINT_ELIGIBLE	2026-09-17 19:50:57.935	\N
a06823a0-e8d0-4cb2-b416-1986659a6b27	33333333-3333-3333-3333-333333333333	7A21350_PHASED_DEBUG.png	33333333-3333-3333-3333-333333333333/a06823a0-e8d0-4cb2-b416-1986659a6b27/7A21350_PHASED_DEBUG.png	image/png	488991	1	1	LOW	PRINT_ELIGIBLE	2026-09-18 03:12:01.803	\N
7b25083a-8cf8-448d-8778-6ac639b814e7	33333333-3333-3333-3333-333333333333	IMG20260918083517.jpg	33333333-3333-3333-3333-333333333333/7b25083a-8cf8-448d-8778-6ac639b814e7/IMG20260918083517.jpg	image/jpeg	6696642	1	1	LOW	PRINT_ELIGIBLE	2026-09-18 03:19:46.283	\N
df7f3134-abe6-4984-9075-6fc6798092e2	33333333-3333-3333-3333-333333333333	IMG20260918083517.jpg	33333333-3333-3333-3333-333333333333/df7f3134-abe6-4984-9075-6fc6798092e2/IMG20260918083517.jpg	image/jpeg	6696642	1	1	LOW	PRINT_ELIGIBLE	2026-09-18 03:47:35.087	\N
\.


--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.notifications (id, shop_id, print_job_id, event_type, channel, destination, status, provider_ref, created_at) FROM stdin;
4b1a898a-9779-46f0-821c-795debb0f7de	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-17 17:27:32.789
1e1b5ebd-9947-4c38-b40b-ff76f54d6687	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-17 17:28:09.931
62fdc58b-1592-4041-918c-5153e0a1bc05	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-17 17:31:34.975
1e3a3978-edbd-44d3-877d-7b778781e457	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-17 17:31:58.752
91236fb9-35ab-46ce-93f5-61c0c0a8cd65	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-17 17:33:28.546
cadc392f-84bb-42a0-a3e8-b9e9c7c64244	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-17 17:34:06.769
77339f0e-a68f-419c-b18a-aa1f38acb1d7	33333333-3333-3333-3333-333333333333	5fbbbb9f-dc84-43b3-aa4e-83f7260eaf3d	PRINT_QUEUED	IN_APP	\N	SENT	\N	2026-09-17 18:16:39.581
6f5ddca6-1794-4a0c-a293-a351c96478de	33333333-3333-3333-3333-333333333333	5fbbbb9f-dc84-43b3-aa4e-83f7260eaf3d	PRINT_QUEUED	IN_APP	\N	SENT	\N	2026-09-17 18:25:13.437
96659de7-4743-4973-820c-ffbcd54f7287	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-17 19:06:28.661
926a17e1-09f4-4805-bda4-1c8936d48104	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-17 19:13:59.321
ab6410cb-8b87-40e1-9617-169e5efcd526	33333333-3333-3333-3333-333333333333	2204a1fb-c798-4e79-b549-dc9b757efc6a	PRINT_QUEUED	IN_APP	\N	SENT	\N	2026-09-17 19:20:05.178
ddb49a14-3f9e-49d5-8748-faa79018cd17	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-17 19:50:57.955
99e1729e-02b8-4e62-a390-135daed1aa0c	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-18 03:12:01.839
339e1c71-4180-4155-9390-34f5315c414b	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-18 03:19:46.299
5d746093-e672-4029-ad1a-18dc02f14044	33333333-3333-3333-3333-333333333333	\N	UPLOAD_RECEIVED	IN_APP	\N	SENT	\N	2026-09-18 03:47:35.103
70e0816b-df44-4529-babf-e2f56d5b3164	33333333-3333-3333-3333-333333333333	a49ce669-a110-4b8a-bfcb-85912c5c9e7d	PRINT_QUEUED	IN_APP	\N	SENT	\N	2026-09-18 03:48:21.352
\.


--
-- Data for Name: pricing; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.pricing (id, shop_id, "paperSize", "colorMode", "sideMode", price_per_page, effective_from, active, created_at) FROM stdin;
c1222cb4-c0a4-40fd-aef8-2474a57669b6	33333333-3333-3333-3333-333333333333	A4	BW	DUPLEX	1.50	2026-09-17 15:28:01.348	t	2026-09-17 15:28:01.348
15d83be8-4fb1-4e3c-9056-7cf530611e44	33333333-3333-3333-3333-333333333333	A4	COLOR	SIMPLEX	8.00	2026-09-17 15:28:01.356	t	2026-09-17 15:28:01.356
3e8fa704-cd2a-4c8d-adce-0a91d4c57919	33333333-3333-3333-3333-333333333333	A4	COLOR	DUPLEX	7.00	2026-09-17 15:28:01.363	t	2026-09-17 15:28:01.363
5f5aa977-4d6a-4ebe-acfe-b4b044666e5d	33333333-3333-3333-3333-333333333333	A3	BW	SIMPLEX	4.00	2026-09-17 15:28:01.376	t	2026-09-17 15:28:01.376
c961587a-152e-4200-b1dc-46845c93c74b	33333333-3333-3333-3333-333333333333	A3	COLOR	SIMPLEX	14.00	2026-09-17 15:28:01.386	t	2026-09-17 15:28:01.386
c2adec2d-b8bf-4e54-9bc8-c5c011e93cad	33333333-3333-3333-3333-333333333333	LETTER	BW	SIMPLEX	2.00	2026-09-17 15:28:01.4	t	2026-09-17 15:28:01.4
8049efe6-28c9-48a2-b488-90d2d20766c5	33333333-3333-3333-3333-333333333333	A4	BW	SIMPLEX	2.00	2026-09-17 15:28:01.333	f	2026-09-17 15:28:01.333
a7bf7047-cd32-479c-b6a3-d6c3a1f95abf	33333333-3333-3333-3333-333333333333	A4	BW	SIMPLEX	3.50	2026-09-17 16:03:27.202	f	2026-09-17 16:03:27.202
d63460d2-4b11-47fc-9441-43c704adf207	33333333-3333-3333-3333-333333333333	A4	BW	SIMPLEX	5.00	2026-09-17 16:08:28.701	f	2026-09-17 16:08:28.701
c968c5b6-c939-4bd2-b5f1-0575ef0151b1	33333333-3333-3333-3333-333333333333	A4	BW	SIMPLEX	5.00	2026-09-17 16:11:11.037	t	2026-09-17 16:11:11.037
5aff9ad2-e514-43e0-9ba0-5a5b5e02d5ec	33333333-3333-3333-3333-333333333333	LEGAL	BW	SIMPLEX	3.00	2026-09-17 15:28:01.394	f	2026-09-17 15:28:01.394
\.


--
-- Data for Name: print_job_events; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_job_events (id, print_job_id, status, agent_attempt_id, message, created_at) FROM stdin;
5b4da026-5839-414c-ad8e-a565a734201a	5fbbbb9f-dc84-43b3-aa4e-83f7260eaf3d	CREATED	\N	\N	2026-09-17 17:34:29.085
cc05ffa2-af30-4967-913a-686017c52d96	5fbbbb9f-dc84-43b3-aa4e-83f7260eaf3d	PRINT_ELIGIBLE	\N	\N	2026-09-17 17:34:29.099
dcc46a38-d1d3-4bf8-855e-efcec34c2765	5fbbbb9f-dc84-43b3-aa4e-83f7260eaf3d	QUEUED	\N	\N	2026-09-17 18:16:39.568
dd13f6b2-08e1-4073-a041-561801815581	5fbbbb9f-dc84-43b3-aa4e-83f7260eaf3d	AGENT_OFFLINE	\N	No connected agent at dispatch time.	2026-09-17 18:16:39.623
b115d01f-6390-4c2d-a3a8-2932c377d8ac	5fbbbb9f-dc84-43b3-aa4e-83f7260eaf3d	QUEUED	\N	\N	2026-09-17 18:25:13.421
c237cbd1-915d-4dbd-b927-9f0aae527520	5fbbbb9f-dc84-43b3-aa4e-83f7260eaf3d	AGENT_OFFLINE	\N	No connected agent at dispatch time.	2026-09-17 18:25:13.482
4ace990c-e66b-4ec5-92a6-15bca684c91b	2204a1fb-c798-4e79-b549-dc9b757efc6a	CREATED	\N	\N	2026-09-17 19:14:39.902
8108b947-6cbb-43f7-98ad-c4853356794f	2204a1fb-c798-4e79-b549-dc9b757efc6a	PRINT_ELIGIBLE	\N	\N	2026-09-17 19:14:39.917
51102357-1624-4f15-ad93-7a8005ac45d6	2204a1fb-c798-4e79-b549-dc9b757efc6a	QUEUED	\N	\N	2026-09-17 19:20:05.165
54401054-37e7-49ba-9623-861306b0ec24	2204a1fb-c798-4e79-b549-dc9b757efc6a	AGENT_OFFLINE	\N	No connected agent at dispatch time.	2026-09-17 19:20:05.238
d336abf1-be8c-42e8-92ce-7ee77e8b8f85	28116fad-a82b-40e4-b1d6-4841acbc0fba	CREATED	\N	\N	2026-09-17 19:51:06.85
f5c25a5f-98aa-4966-99c2-57e1e2e9958f	28116fad-a82b-40e4-b1d6-4841acbc0fba	PRINT_ELIGIBLE	\N	\N	2026-09-17 19:51:06.87
459da00e-fcf8-4d86-a7e6-e82a3674eaee	21071121-29da-4d14-b224-6773e4941915	CREATED	\N	\N	2026-09-18 03:12:29.546
28a8aaed-beef-44d4-92fd-0b10e3002f9f	21071121-29da-4d14-b224-6773e4941915	PRINT_ELIGIBLE	\N	\N	2026-09-18 03:12:29.571
00c5fb2f-6a2c-49ff-a95e-4bd3f1b609a8	ed98b309-2659-4fee-b4de-c0d83f23075a	CREATED	\N	\N	2026-09-18 03:19:58.165
58e8b333-6b88-4039-8ad4-e381a439cf84	ed98b309-2659-4fee-b4de-c0d83f23075a	PRINT_ELIGIBLE	\N	\N	2026-09-18 03:19:58.18
cddb58a6-aea9-4ec9-b9ed-ded7d4ecaf8e	a49ce669-a110-4b8a-bfcb-85912c5c9e7d	CREATED	\N	\N	2026-09-18 03:47:42.798
7ac0e1e5-2089-4ca8-9092-4559a05f8f71	a49ce669-a110-4b8a-bfcb-85912c5c9e7d	PRINT_ELIGIBLE	\N	\N	2026-09-18 03:47:42.819
eb694bc7-03dd-49e3-b540-e9690e2ebcf0	a49ce669-a110-4b8a-bfcb-85912c5c9e7d	QUEUED	\N	\N	2026-09-18 03:48:21.337
56ade5f4-6ada-4a2c-a153-1dddc0ed046b	a49ce669-a110-4b8a-bfcb-85912c5c9e7d	AGENT_OFFLINE	\N	No connected agent at dispatch time.	2026-09-18 03:48:21.388
\.


--
-- Data for Name: print_jobs; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_jobs (id, shop_id, document_id, printer_id, quote_id, options_json, amount, currency, status, attempt_count, idempotency_key, queued_at, printed_at, failure_reason, status_token, created_at, updated_at, token_number) FROM stdin;
5fbbbb9f-dc84-43b3-aa4e-83f7260eaf3d	33333333-3333-3333-3333-333333333333	87d0df23-ce80-4352-92cc-d535ee00d06c	8f3676e5-fd50-4d1f-9324-93289ae894ba	90d901b1-caae-492d-9092-1491d62dcae5	{"copies": 1, "sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4"}	10.00	INR	AGENT_OFFLINE	2	quote:90d901b1-caae-492d-9092-1491d62dcae5	2026-09-17 18:25:13.407	\N	\N	eyJzaG9wSWQiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJwcmludEpvYklkIjoiNWZiYmJiOWYtZGM4NC00M2IzLWFhNGUtODNmNzI2MGVhZjNkIiwiZXhwIjoxNzg5ODM5MjY5fQ.OciFoiJekdVEc3yTdLteWMTGTWaepEYi0tjVbeaJXFg	2026-09-17 17:34:29.08	2026-09-17 18:25:13.479	1
2204a1fb-c798-4e79-b549-dc9b757efc6a	33333333-3333-3333-3333-333333333333	27b9f64b-bbff-4663-8e9e-9157fa16bc4b	8f3676e5-fd50-4d1f-9324-93289ae894ba	b1812526-bea3-45d6-be1b-bbfcd503469a	{"copies": 1, "sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4"}	5.00	INR	AGENT_OFFLINE	1	quote:b1812526-bea3-45d6-be1b-bbfcd503469a	2026-09-17 19:20:05.148	\N	\N	eyJzaG9wSWQiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJwcmludEpvYklkIjoiMjIwNGExZmItYzc5OC00ZTc5LWI1NDktZGM5Yjc1N2VmYzZhIiwiZXhwIjoxNzg5ODQ1Mjc5fQ.BwES8eSEUKFw12SPI9Bk4snGSJsFZ4TLF0358lqftyI	2026-09-17 19:14:39.896	2026-09-17 19:20:05.234	2
28116fad-a82b-40e4-b1d6-4841acbc0fba	33333333-3333-3333-3333-333333333333	21dc33d9-4831-439d-8515-343608ca24de	\N	b744e476-c601-4214-8a38-e5a057c780ee	{"copies": 1, "sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4"}	5.00	INR	PRINT_ELIGIBLE	0	quote:b744e476-c601-4214-8a38-e5a057c780ee	\N	\N	\N	eyJzaG9wSWQiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJwcmludEpvYklkIjoiMjgxMTZmYWQtYTgyYi00MGU0LWIxZDYtNDg0MWFjYmMwZmJhIiwiZXhwIjoxNzg5ODQ3NDY2fQ.NoOdWp0J6HRHvUJp7k8jT0bu9SmIazvArE4IzAOIwd4	2026-09-17 19:51:06.838	2026-09-17 19:51:06.868	3
21071121-29da-4d14-b224-6773e4941915	33333333-3333-3333-3333-333333333333	a06823a0-e8d0-4cb2-b416-1986659a6b27	\N	7115f976-5f7d-41d8-baa6-206dda86657a	{"copies": 1, "sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4"}	5.00	INR	PRINT_ELIGIBLE	0	quote:7115f976-5f7d-41d8-baa6-206dda86657a	\N	\N	\N	eyJzaG9wSWQiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJwcmludEpvYklkIjoiMjEwNzExMjEtMjlkYS00ZDE0LWIyMjQtNjc3M2U0OTQxOTE1IiwiZXhwIjoxNzg5ODczOTQ5fQ.HqdghjIJLnqX2O641PpDRo6Y5-euhuH6yZnYEL36a1A	2026-09-18 03:12:29.533	2026-09-18 03:12:29.568	4
ed98b309-2659-4fee-b4de-c0d83f23075a	33333333-3333-3333-3333-333333333333	7b25083a-8cf8-448d-8778-6ac639b814e7	\N	08e3844e-fb68-4083-8347-ffe21ef7695c	{"copies": 1, "sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4"}	5.00	INR	PRINT_ELIGIBLE	0	quote:08e3844e-fb68-4083-8347-ffe21ef7695c	\N	\N	\N	eyJzaG9wSWQiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJwcmludEpvYklkIjoiZWQ5OGIzMDktMjY1OS00ZmVlLWI0ZGUtYzBkODNmMjMwNzVhIiwiZXhwIjoxNzg5ODc0Mzk4fQ.q8-0XYMDkgAJKgP11XJIk1dfzDtvhQnogvrax4Ztrag	2026-09-18 03:19:58.155	2026-09-18 03:19:58.178	5
a49ce669-a110-4b8a-bfcb-85912c5c9e7d	33333333-3333-3333-3333-333333333333	df7f3134-abe6-4984-9075-6fc6798092e2	8f3676e5-fd50-4d1f-9324-93289ae894ba	55c4f2f5-80c1-42d7-971b-d888efdfd20a	{"copies": 1, "sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4"}	5.00	INR	AGENT_OFFLINE	1	quote:55c4f2f5-80c1-42d7-971b-d888efdfd20a	2026-09-18 03:48:21.328	\N	\N	eyJzaG9wSWQiOiIzMzMzMzMzMy0zMzMzLTMzMzMtMzMzMy0zMzMzMzMzMzMzMzMiLCJwcmludEpvYklkIjoiYTQ5Y2U2NjktYTExMC00YjhhLWJmY2ItODU5MTJjNWM5ZTdkIiwiZXhwIjoxNzg5ODc2MDYyfQ.kD8W-7FRHInSnxfMrl9YRp9PsGJqYLHwIDFiiacHupo	2026-09-18 03:47:42.789	2026-09-18 03:48:21.384	6
\.


--
-- Data for Name: print_quotes; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_quotes (id, document_id, "paperSize", "colorMode", "sideMode", copies, page_count, billable_pages, amount, currency, pricing_snapshot, status_token_claim_id, expires_at, consumed_at, created_at) FROM stdin;
90d901b1-caae-492d-9092-1491d62dcae5	87d0df23-ce80-4352-92cc-d535ee00d06c	A4	BW	SIMPLEX	1	2	2	10.00	INR	{"sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4", "pricingId": "c968c5b6-c939-4bd2-b5f1-0575ef0151b1", "pricePerPage": "5", "effectiveFrom": "2026-09-17T16:11:11.037Z"}	71b5b8f6-03b8-4e3e-9390-8f714a8147d2	2026-09-17 17:49:08.875	2026-09-17 17:34:29.089	2026-09-17 17:34:08.877
b1812526-bea3-45d6-be1b-bbfcd503469a	27b9f64b-bbff-4663-8e9e-9157fa16bc4b	A4	BW	SIMPLEX	1	1	1	5.00	INR	{"sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4", "pricingId": "c968c5b6-c939-4bd2-b5f1-0575ef0151b1", "pricePerPage": "5", "effectiveFrom": "2026-09-17T16:11:11.037Z"}	7b29ab3a-dc8c-4302-8e86-0780419373bb	2026-09-17 19:29:01.526	2026-09-17 19:14:39.906	2026-09-17 19:14:01.527
b744e476-c601-4214-8a38-e5a057c780ee	21dc33d9-4831-439d-8515-343608ca24de	A4	BW	SIMPLEX	1	1	1	5.00	INR	{"sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4", "pricingId": "c968c5b6-c939-4bd2-b5f1-0575ef0151b1", "pricePerPage": "5", "effectiveFrom": "2026-09-17T16:11:11.037Z"}	d68a7dc3-2f93-4152-9cb8-ab6a20264974	2026-09-17 20:06:00.069	2026-09-17 19:51:06.853	2026-09-17 19:51:00.073
7115f976-5f7d-41d8-baa6-206dda86657a	a06823a0-e8d0-4cb2-b416-1986659a6b27	A4	BW	SIMPLEX	1	1	1	5.00	INR	{"sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4", "pricingId": "c968c5b6-c939-4bd2-b5f1-0575ef0151b1", "pricePerPage": "5", "effectiveFrom": "2026-09-17T16:11:11.037Z"}	86596d8a-710b-4142-b68d-ab122bc7fc7c	2026-09-18 03:27:03.89	2026-09-18 03:12:29.554	2026-09-18 03:12:03.891
08e3844e-fb68-4083-8347-ffe21ef7695c	7b25083a-8cf8-448d-8778-6ac639b814e7	A4	BW	SIMPLEX	1	1	1	5.00	INR	{"sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4", "pricingId": "c968c5b6-c939-4bd2-b5f1-0575ef0151b1", "pricePerPage": "5", "effectiveFrom": "2026-09-17T16:11:11.037Z"}	050d17cc-350c-48fc-9d2f-c71515cf0436	2026-09-18 03:34:48.441	2026-09-18 03:19:58.156	2026-09-18 03:19:48.453
55c4f2f5-80c1-42d7-971b-d888efdfd20a	df7f3134-abe6-4984-9075-6fc6798092e2	A4	BW	SIMPLEX	1	1	1	5.00	INR	{"sideMode": "SIMPLEX", "colorMode": "BW", "paperSize": "A4", "pricingId": "c968c5b6-c939-4bd2-b5f1-0575ef0151b1", "pricePerPage": "5", "effectiveFrom": "2026-09-17T16:11:11.037Z"}	da0d976d-619a-48f5-b167-284e73e21fc6	2026-09-18 04:02:37.205	2026-09-18 03:47:42.803	2026-09-18 03:47:37.207
\.


--
-- Data for Name: print_settings; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.print_settings (id, shop_id, default_printer_id, retention_minutes, max_file_size, updated_at, document_preview_enabled) FROM stdin;
a360e764-b1fe-44be-bfd7-02c3a58ff42f	33333333-3333-3333-3333-333333333333	\N	30	26214400	2026-09-17 19:04:33.185	t
\.


--
-- Data for Name: printers; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.printers (id, shop_id, agent_id, agent_key_hash, printer_name, driver_name, status, last_heartbeat_at, capabilities_json, created_at, updated_at) FROM stdin;
9c24c5e4-508e-47a6-ae9e-dd80371c159f	33333333-3333-3333-3333-333333333333	r9vyurerij0na1v1j848	2e2c9be56493cc4250f7c3c1232159dd:65843f8b2de2a7dbcd035911e9c53d5da1a0b81bdcf1834cb5efea7da5775805e26125238031886e6c719b434b7dcce61d169c417cd0a3c45f8bd0b17376a473	Print Agent	auto	UNKNOWN	\N	\N	2026-09-17 18:00:59.777	2026-09-17 18:00:59.777
8f3676e5-fd50-4d1f-9324-93289ae894ba	33333333-3333-3333-3333-333333333333	bdpzqdfbl06tauljyzeu	cbd797aa3d059dc0f50679ab0bfe9825:5afad584f7b1e67428cf8c6a53ccc0935ab61f5c4d2b49843505b5fcc5d1784e1432e611bfa0a54a3f888a11a2ad76369bb1111f5a020a52912a9cafccc94e82	Print Agent	auto	OFFLINE	2026-09-17 18:01:05.383	\N	2026-09-17 17:56:04.158	2026-09-17 18:01:12.044
311a0a52-4e32-42ad-b124-42c3330b29fe	33333333-3333-3333-3333-333333333333	hhfd05ofkiel0woggtgn	4750eedfcbd8644609bab6d7a0c65f8b:42507f82e8561bd48f3bfd8e4aebc9abf08809e64673c62db7642090f4e259f3a4980628df63c9efd4837d56867a7614dfde6b2f840f493b833992904714e31a	Print Agent	auto	UNKNOWN	\N	\N	2026-09-17 18:10:29.538	2026-09-17 18:10:29.538
884a53d3-b68e-4629-bb17-687aae1de0d2	33333333-3333-3333-3333-333333333333	9w0mt6xs3r8nhirfyj9j	e29e14242322f0f70bc0ff452e095aaa:1df57bae38aba50cacb8e56c2a69608f93129454133478e07c8b7787dcef81a19f8039553d1bf0122947f1fe5a262e1938c9f9f5cf81b0d308e4fc4a7ab7051d	Print Agent	auto	UNKNOWN	\N	\N	2026-09-17 18:13:06.903	2026-09-17 18:13:06.903
39ade333-05ca-429c-a267-7aa59622cae0	33333333-3333-3333-3333-333333333333	cxca29uz9wykvsj5e1jn	8fb186ec4626cd79169864950ffb89f0:c8bb2cc14a0b9a6430ee5ecd26a4fdd748f97cb247cff773523b0cd87a7207f037f0cba017b6cbdb1fbf0c36c696097d7589600b84c569b819ee2bf0c2dfbe99	Print Agent	auto	ONLINE	2026-09-18 04:09:34.609	\N	2026-09-17 18:14:12.755	2026-09-18 04:09:34.61
\.


--
-- Data for Name: qr_codes; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.qr_codes (id, shop_id, public_code, target_path, status, generated_at, revoked_at) FROM stdin;
614bbaec-93f4-4d5b-be54-926dbe567afa	33333333-3333-3333-3333-333333333333	demoShopQR001	/s/demoShopQR001	ACTIVE	2026-09-17 15:28:01.411	\N
\.


--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.roles (id, name, description) FROM stdin;
0ef261ce-ba3d-4b01-b192-f6cd3d71a355	SHOPKEEPER	Shop-level operator
5c8ca446-2a48-4f8e-9b16-fc9ff2b1772c	ADMIN	Platform administrator
\.


--
-- Data for Name: shops; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.shops (id, shop_code, name, owner_name, mobile, email, address, city, status, created_at, updated_at) FROM stdin;
33333333-3333-3333-3333-333333333333	SHOP-DEMO001	PrintSetu Demo Shop	Demo Owner	9999999999	demo.shop@printsetu.local	1st Floor, MG Road	Ahmedabad	ACTIVE	2026-09-17 15:28:01.259	2026-09-17 15:28:01.259
\.


--
-- Data for Name: system_settings; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.system_settings (key, value_json, updated_at) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: printsetu
--

COPY public.users (id, shop_id, role_id, name, mobile, email, password_hash, keycloak_user_id, status, last_login_at, created_at, updated_at) FROM stdin;
49ef9744-f036-43b8-8ba1-357e041088d0	\N	5c8ca446-2a48-4f8e-9b16-fc9ff2b1772c	PrintSetu Admin	9000000001	admin.demo@printsetu.local	\N	11111111-1111-1111-1111-111111111111	ACTIVE	2026-09-18 03:46:11.626	2026-09-17 15:28:01.304	2026-09-18 03:46:11.629
8177ff11-d97e-44a1-9fe6-49c81e7159ca	33333333-3333-3333-3333-333333333333	0ef261ce-ba3d-4b01-b192-f6cd3d71a355	PrintSetu Shopkeeper	9000000002	shopkeeper.demo@printsetu.local	\N	22222222-2222-2222-2222-222222222222	ACTIVE	2026-09-18 03:58:54.661	2026-09-17 15:28:01.318	2026-09-18 03:58:54.662
\.


--
-- Name: print_jobs_token_number_seq; Type: SEQUENCE SET; Schema: public; Owner: printsetu
--

SELECT pg_catalog.setval('public.print_jobs_token_number_seq', 6, true);


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
-- Name: print_jobs print_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_pkey PRIMARY KEY (id);


--
-- Name: print_quotes print_quotes_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_quotes
    ADD CONSTRAINT print_quotes_pkey PRIMARY KEY (id);


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
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: shops shops_pkey; Type: CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.shops
    ADD CONSTRAINT shops_pkey PRIMARY KEY (id);


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
-- Name: documents_shop_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX documents_shop_id_idx ON public.documents USING btree (shop_id);


--
-- Name: documents_status_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX documents_status_idx ON public.documents USING btree (status);


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
-- Name: print_jobs_document_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX print_jobs_document_id_idx ON public.print_jobs USING btree (document_id);


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
-- Name: print_quotes_document_id_idx; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE INDEX print_quotes_document_id_idx ON public.print_quotes USING btree (document_id);


--
-- Name: print_quotes_status_token_claim_id_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX print_quotes_status_token_claim_id_key ON public.print_quotes USING btree (status_token_claim_id);


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
-- Name: roles_name_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX roles_name_key ON public.roles USING btree (name);


--
-- Name: shops_shop_code_key; Type: INDEX; Schema: public; Owner: printsetu
--

CREATE UNIQUE INDEX shops_shop_code_key ON public.shops USING btree (shop_code);


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
-- Name: documents documents_shop_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_shop_id_fkey FOREIGN KEY (shop_id) REFERENCES public.shops(id) ON UPDATE CASCADE ON DELETE RESTRICT;


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
-- Name: print_jobs print_jobs_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_jobs
    ADD CONSTRAINT print_jobs_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


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
-- Name: print_quotes print_quotes_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: printsetu
--

ALTER TABLE ONLY public.print_quotes
    ADD CONSTRAINT print_quotes_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE RESTRICT;


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
-- PostgreSQL database dump complete
--

\unrestrict 8oujVfrVgd5HE9bUhc5jdhkcdddMM6CDMM4FUjud1brmquPlG9VL0vvY0pNgCIi

