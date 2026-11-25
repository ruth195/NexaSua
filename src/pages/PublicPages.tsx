import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  FileText,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { formatGhanaDate, formatGhs } from '../components/BrandLogo';
import { DEFAULT_GHANA_BANDS, PricingCalculator } from '../components/PricingCalculator';
import { apiFetch } from '../lib/api';
import type { HealthResponse, PlanCatalogItem, SubscriptionPlan } from '../types/nexasua';

const HERO_IMAGE = '/src/assets/images/hero_ghana_school_1795376106673.jpg';
const OFFICE_IMAGE = '/src/assets/images/campus_admin_office_1795376106281.jpg';

const CORE_FEATURES = [
  'Student records, enrollment & promotion history',
  'Teacher management & subject assignments',
  'Classes, subjects & academic calendar setup',
  'Flexible assessment categories (optional 30/70 GES scheme)',
  'Examination score entry & deterministic grading',
  'Class teacher review & headteacher approval workflow',
  'A4 PDF terminal report cards with QR verification',
  'Daily attendance registers & summaries',
  'Dedicated Student & Parent portals',
  'Academic analytics & historical records',
];

const COMPLETE_FEATURES = [
  'Everything in NexaSua Core',
  'School fee structures & automated term invoices',
  'Verified offline cash/MoMo/bank payment recording',
  'Online Paystack school fee payments & reconciliation',
  'Official PDF receipts & append-only financial ledger',
  'Outstanding balances, waivers, discounts & reversals',
  'Scheduled fee reminders (In-app, Email, SMS)',
  'Targeted school announcements & communication history',
  'Admissions pipeline with one-click student enrollment',
  'Staff directory, leave workflows & conflict-free timetables',
  'Financial dashboards with PDF & CSV exports',
];

export function PublicPageRouter({
  path,
  health,
  onNavigate,
  onSelectPlanForRegistration,
}: {
  path: string;
  health: HealthResponse | null;
  onNavigate: (path: string) => void;
  onSelectPlanForRegistration: (plan: SubscriptionPlan, pop: number) => void;
}) {
  const bands = health?.pricing?.bands?.length ? health.pricing.bands : DEFAULT_GHANA_BANDS;
  const trialDays = health?.pricing?.trialDays ?? 7;
  const discountPct = health?.pricing?.threeTermDiscountPercent ?? 10;
  const planCatalog = health?.pricing?.plans;

  if (path === '/features') {
    return <FeaturesPage onNavigate={onNavigate} />;
  }
  if (path === '/how-it-works') {
    return <HowItWorksPage onNavigate={onNavigate} />;
  }
  if (path === '/solutions') {
    return <SolutionsPage onNavigate={onNavigate} />;
  }
  if (path === '/core') {
    return (
      <PlanDetailPage
        plan="CORE"
        planCatalog={planCatalog}
        onNavigate={onNavigate}
        onSelectPlan={onSelectPlanForRegistration}
      />
    );
  }
  if (path === '/complete') {
    return (
      <PlanDetailPage
        plan="COMPLETE"
        planCatalog={planCatalog}
        onNavigate={onNavigate}
        onSelectPlan={onSelectPlanForRegistration}
      />
    );
  }
  if (path === '/pricing') {
    return (
      <PricingPage
        bands={bands}
        trialDays={trialDays}
        discountPct={discountPct}
        onNavigate={onNavigate}
        onSelectPlan={onSelectPlanForRegistration}
      />
    );
  }
  if (path === '/custom') {
    return <CustomSystemsPage />;
  }
  if (path === '/about') {
    return <AboutPage onNavigate={onNavigate} />;
  }
  if (path === '/contact') {
    return <ContactPage />;
  }
  if (path === '/faq') {
    return <FaqPage onNavigate={onNavigate} />;
  }
  if (path === '/privacy') {
    return <LegalPage type="privacy" />;
  }
  if (path === '/terms') {
    return <LegalPage type="terms" />;
  }
  if (path === '/verify-report') {
    return <VerifyReportPage />;
  }

  return (
    <HomePage
      bands={bands}
      trialDays={trialDays}
      discountPct={discountPct}
      planCatalog={planCatalog}
      onNavigate={onNavigate}
      onSelectPlan={onSelectPlanForRegistration}
    />
  );
}

function HomePage({
  bands,
  trialDays,
  discountPct,
  planCatalog,
  onNavigate,
  onSelectPlan,
}: {
  bands: typeof DEFAULT_GHANA_BANDS;
  trialDays: number;
  discountPct: number;
  planCatalog?: PlanCatalogItem[];
  onNavigate: (p: string) => void;
  onSelectPlan: (plan: SubscriptionPlan, pop: number) => void;
}) {
  const activePlans: PlanCatalogItem[] =
    planCatalog && planCatalog.filter((p) => p.isActive !== false).length > 0
      ? planCatalog.filter((p) => p.isActive !== false)
      : [
          {
            code: 'CORE',
            name: 'NexaSua Core',
            tagline:
              'Focused on academics, structured examination approvals, attendance, and digital report cards.',
            durationLabel: 'Per Term (120 Days)',
            durationDays: 120,
            startingPriceLabel: 'From GH₵350 / term',
            features: CORE_FEATURES,
            isFeatured: false,
            isActive: true,
          },
          {
            code: 'COMPLETE',
            name: 'NexaSua Complete',
            tagline:
              'Everything in Core plus school fee billing, Paystack collections, automated reminders, admissions, staff management, and timetables.',
            durationLabel: 'Per Term (120 Days)',
            durationDays: 120,
            startingPriceLabel: 'From GH₵650 / term',
            features: COMPLETE_FEATURES,
            isFeatured: true,
            isActive: true,
          },
        ];
  return (
    <div>
      {/* Hero Section */}
      <section className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="text-xs font-semibold text-[#148D82] tracking-wide">
                NexaFlow Technologies · Built for Ghana & Africa
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-[#102846] leading-[1.12] tracking-tight text-balance">
                Run Your School Smarter with NexaSua.
              </h1>
              <p className="text-base sm:text-lg text-[#64748B] leading-relaxed max-w-xl">
                From marking examinations to generating report cards and managing school fees,
                NexaSua brings the day-to-day running of your school into one secure place.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('/register')}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#148D82] px-6 py-3 text-sm font-semibold text-white hover:bg-[#10766c] transition-colors whitespace-nowrap"
                >
                  Register Your School
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('/features')}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-[#102846] hover:bg-[#FBF8F1] transition-colors whitespace-nowrap"
                >
                  Explore the Platform
                </button>
              </div>
              <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#64748B]">
                <span>Kindergarten & Primary</span>
                <span aria-hidden="true">·</span>
                <span>Junior High School</span>
                <span aria-hidden="true">·</span>
                <span>Senior High School</span>
                <span aria-hidden="true">·</span>
                <span>{trialDays}-Day Free Trial</span>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-[#102846]">
                <img
                  src={HERO_IMAGE}
                  alt="Ghanaian teacher guiding students inside a bright classroom"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core vs Complete Architecture */}
      <section className="py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-12">
            <h2 className="text-3xl font-bold text-[#102846] tracking-tight text-balance">
              Two clear plans built for Ghanaian school operations
            </h2>
            <p className="mt-3 text-base text-[#64748B]">
              Start with academic digitization and terminal report cards on Core, or run your
              entire bursary, admissions, timetable, and parent communications on Complete.
            </p>
          </div>

          <div
            className={`grid grid-cols-1 gap-8 ${
              activePlans.length >= 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
            }`}
          >
            {activePlans.map((planItem) => {
              const isCustomTier = planItem.code !== 'CORE' && planItem.code !== 'COMPLETE';
              const targetPlan: SubscriptionPlan = planItem.code === 'CORE' ? 'CORE' : 'COMPLETE';
              const detailRoute =
                planItem.code === 'CORE'
                  ? '/core'
                  : planItem.code === 'COMPLETE'
                    ? '/complete'
                    : '/custom';
              return (
                <div
                  key={planItem.code}
                  className={`bg-white rounded-xl p-8 flex flex-col justify-between ${
                    planItem.isFeatured ? 'border-2 border-[#148D82]' : 'border border-slate-200'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-xl font-bold text-[#102846]">{planItem.name}</h3>
                      <span className="text-sm font-mono font-semibold text-[#148D82] tabular-nums">
                        {planItem.startingPriceLabel}
                      </span>
                    </div>
                    <div className="text-xs font-mono text-[#64748B] mt-1">
                      {planItem.durationLabel}
                    </div>
                    <p className="mt-2 text-sm text-[#64748B]">{planItem.tagline}</p>
                    <ul className="mt-6 space-y-2.5 text-sm text-[#102846]">
                      {planItem.features.map((feat) => (
                        <li key={feat} className="flex items-start gap-2.5">
                          <Check className="w-4 h-4 text-[#148D82] shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="mt-8 pt-6 border-t border-slate-100 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() =>
                        isCustomTier
                          ? onNavigate('/custom')
                          : onSelectPlan(targetPlan, targetPlan === 'CORE' ? 150 : 250)
                      }
                      className={`rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors ${
                        planItem.isFeatured
                          ? 'bg-[#148D82] hover:bg-[#10766c]'
                          : 'bg-[#102846] hover:bg-[#1a3c66]'
                      }`}
                    >
                      {isCustomTier ? `Explore ${planItem.name}` : `Choose ${planItem.name.replace(/^NexaSua\s+/i, '')}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => onNavigate(detailRoute)}
                      className="text-sm font-semibold text-[#148D82] hover:underline"
                    >
                      Full details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Calculator */}
      <section className="py-16 bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mb-10">
            <h2 className="text-3xl font-bold text-[#102846] tracking-tight">
              Transparent Termly Pricing in Ghana Cedis
            </h2>
            <p className="mt-2 text-base text-[#64748B]">
              Only the school subscribes—never individual learners. Prepay three terms to save{' '}
              {discountPct}%.
            </p>
          </div>
          <PricingCalculator
            bands={bands}
            threeTermDiscountPercent={discountPct}
            trialDays={trialDays}
            onSelectPlan={(p, pop) => onSelectPlan(p, pop)}
          />
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-[#102846] tracking-tight mb-10">
            How Ghanaian Schools Get Started
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01. Register & Verify',
                text: 'Submit your school profile, educational levels, and administrator account. Once reviewed and approved, receive your unique school code and 7-day free trial.',
              },
              {
                step: '02. Configure & Enroll',
                text: 'Follow the guided onboarding checklist to set up academic years, terms, classes, subjects, 30/70 or custom grading schemes, teachers, and students via CSV/Excel.',
              },
              {
                step: '03. Mark, Approve & Collect',
                text: 'Teachers submit continuous assessment and exam scores, headteachers publish approved results as QR-verified PDF report cards, and bursars manage fees.',
              },
            ].map((item) => (
              <div key={item.step} className="bg-white border border-slate-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-[#102846]">{item.step}</h3>
                <p className="mt-2 text-sm text-[#64748B] leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Custom Systems Callout */}
      <section className="py-16 bg-[#102846] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8">
          <div className="max-w-2xl space-y-3">
            <div className="text-xs font-semibold text-[#E2A83B]">NexaSua Custom</div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-balance">
              Need a School Management System Built Specifically for Your School?
            </h2>
            <p className="text-sm sm:text-base text-slate-300">
              NexaFlow Technologies delivers white-label school portals (starting around GH₵2,000
              setup) and bespoke multi-campus school systems (starting around GH₵8,000).
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('/custom')}
            className="rounded-lg bg-[#E2A83B] px-6 py-3 text-sm font-bold text-[#102846] hover:bg-[#eab858] transition-colors whitespace-nowrap shrink-0"
          >
            Request a Custom System
          </button>
        </div>
      </section>
    </div>
  );
}

function FeaturesPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const modules = [
    {
      title: '01. Examination & Deterministic Grading Engine',
      desc: 'Supports class exercises, quizzes, assignments, projects, practicals, continuous assessment, and end-of-term exams. Includes optional 30/70 scheme, zero vs missing distinction, max-mark guards, and tied rankings.',
    },
    {
      title: '02. Controlled Academic Review & Publication',
      desc: 'Subject teachers submit marks, class teachers review completeness, and headteachers approve publication. Published scores are locked with audited correction workflows.',
    },
    {
      title: '03. A4 Digital Terminal Report Cards',
      desc: 'Print-safe colour and black-and-white A4 PDFs featuring school crest, attendance summary, remarks, promotion status, next-term reopening date, and privacy-safe QR verification.',
    },
    {
      title: '04. School Fees, Paystack & Immutable Ledger (Complete)',
      desc: 'Configure tuition, feeding, boarding, transport, and levies. Accept verified offline MoMo/cash/bank payments or online Paystack payments with duplicate protection and PDF receipts.',
    },
    {
      title: '05. Admissions, Staff & Conflict-Free Timetables (Complete)',
      desc: 'Review online applications and convert accepted applicants directly into enrolled students. Track staff leave requests and build timetables with automatic teacher/class/room conflict checks.',
    },
    {
      title: '06. Strict Multi-Tenant Isolation & Ghana Data Protection',
      desc: 'Every school operates in an isolated tenant environment with role-based access control, verified guardian-child linking, MFA support, and Ghana Act 843 data protection alignment.',
    },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="max-w-2xl mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold text-[#102846] tracking-tight">
          Built Around Real Ghanaian School Workflows
        </h1>
        <p className="mt-3 text-base text-[#64748B]">
          Every module is backed by server-side authorization and persistent MongoDB Atlas storage.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {modules.map((m) => (
          <div key={m.title} className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-lg font-bold text-[#102846]">{m.title}</h2>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">{m.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-10">
        <button
          type="button"
          onClick={() => onNavigate('/register')}
          className="rounded-lg bg-[#148D82] px-6 py-3 text-sm font-semibold text-white hover:bg-[#10766c]"
        >
          Register Your School
        </button>
      </div>
    </div>
  );
}

function HowItWorksPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const steps = [
    ['1. School Application', 'Register your institution with school details, educational levels, and administrator credentials.'],
    ['2. Platform Verification', 'NexaFlow verifies the school application, generates a unique school code, and activates your 7-day trial.'],
    ['3. Guided Onboarding', 'Set academic year, current term, classes, subjects, grading scheme, and invite teachers and bursars.'],
    ['4. Student & Guardian Setup', 'Enroll learners individually or via CSV/Excel import and verify guardian-child links.'],
    ['5. Termly Operations', 'Run continuous assessments, approve results, issue PDF report cards, and track school fee collections.'],
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-[#102846]">How NexaSua Works</h1>
        <p className="mt-3 text-base text-[#64748B]">
          A structured, secure onboarding path from registration to termly report cards.
        </p>
      </div>
      <div className="space-y-4">
        {steps.map(([title, desc]) => (
          <div key={title} className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-lg font-bold text-[#102846]">{title}</h2>
            <p className="mt-1.5 text-sm text-[#64748B]">{desc}</p>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onNavigate('/register')}
        className="rounded-lg bg-[#148D82] px-6 py-3 text-sm font-semibold text-white"
      >
        Start School Registration
      </button>
    </div>
  );
}

function SolutionsPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const levels = [
    {
      name: 'Kindergarten & Nursery',
      desc: 'Developmental remarks, attendance summaries, verified guardian pickup/portal links, and clean printable terminal reports.',
    },
    {
      name: 'Primary Schools',
      desc: 'Class-teacher centered marking, continuous assessment tracking, school feeding & transport fee invoicing, and parent notices.',
    },
    {
      name: 'Junior High Schools (JHS)',
      desc: 'Subject-teacher marks entry, 30/70 CA & exam grading scales, mock/BECE prep analytics, and class position rankings.',
    },
    {
      name: 'Senior High Schools (SHS)',
      desc: 'Multi-programme class structures, boarding vs day fee categories, scholarship waivers, department staff records, and timetable conflict checks.',
    },
  ];
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl sm:text-4xl font-bold text-[#102846] mb-4">
        Tailored for Every Ghanaian School Level
      </h1>
      <p className="text-base text-[#64748B] max-w-2xl mb-10">
        Select one or multiple educational levels during registration, with multi-branch support
        ready as your school group grows.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {levels.map((l) => (
          <div key={l.name} className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-xl font-bold text-[#102846]">{l.name}</h2>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">{l.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-10">
        <button
          type="button"
          onClick={() => onNavigate('/register')}
          className="rounded-lg bg-[#148D82] px-6 py-3 text-sm font-semibold text-white"
        >
          Register Your School
        </button>
      </div>
    </div>
  );
}

function PlanDetailPage({
  plan,
  planCatalog,
  onNavigate,
  onSelectPlan,
}: {
  plan: SubscriptionPlan;
  planCatalog?: PlanCatalogItem[];
  onNavigate: (p: string) => void;
  onSelectPlan: (plan: SubscriptionPlan, pop: number) => void;
}) {
  const isCore = plan === 'CORE';
  const dynamicPlan = planCatalog?.find((p) => p.code === plan);
  const list = dynamicPlan?.features?.length
    ? dynamicPlan.features
    : isCore
      ? CORE_FEATURES
      : COMPLETE_FEATURES;
  const title = dynamicPlan?.name || (isCore ? 'NexaSua Core' : 'NexaSua Complete');
  const tagline =
    dynamicPlan?.tagline ||
    (isCore
      ? 'Designed for schools ready to digitize student records, assessments, attendance, and terminal report cards.'
      : 'Designed for schools requiring complete academic workflows plus fee billing, Paystack payments, reminders, admissions, staff management, and timetables.');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-8">
      <div>
        <div className="text-xs font-semibold text-[#148D82]">
          {isCore ? 'Academic Operations Tier' : 'Full School Administration & Finance Tier'}
          {dynamicPlan?.startingPriceLabel ? ` · ${dynamicPlan.startingPriceLabel}` : ''}
          {dynamicPlan?.durationLabel ? ` · ${dynamicPlan.durationLabel}` : ''}
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold text-[#102846] mt-1">{title}</h1>
        <p className="mt-3 text-base text-[#64748B]">{tagline}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-8">
        <h2 className="text-lg font-bold text-[#102846] mb-4">Included Capabilities</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {list.map((item) => (
            <div key={item} className="flex items-start gap-2.5 text-sm text-[#102846]">
              <Check className="w-4 h-4 text-[#148D82] shrink-0 mt-0.5" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => onSelectPlan(plan, 200)}
          className="rounded-lg bg-[#148D82] px-6 py-3 text-sm font-semibold text-white"
        >
          Register with {isCore ? 'Core' : 'Complete'}
        </button>
        <button
          type="button"
          onClick={() => onNavigate('/pricing')}
          className="rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-[#102846]"
        >
          Compare Pricing Bands
        </button>
      </div>
    </div>
  );
}

function PricingPage({
  bands,
  trialDays,
  discountPct,
  onNavigate,
  onSelectPlan,
}: {
  bands: typeof DEFAULT_GHANA_BANDS;
  trialDays: number;
  discountPct: number;
  onNavigate: (p: string) => void;
  onSelectPlan: (plan: SubscriptionPlan, pop: number) => void;
}) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-12">
      <div className="max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold text-[#102846]">
          Introductory Ghana Pricing
        </h1>
        <p className="mt-3 text-base text-[#64748B]">
          Billed per school based on active student population. Includes a {trialDays}-day free
          trial and a {discountPct}% discount when prepaying three terms.
        </p>
      </div>

      <PricingCalculator
        bands={bands}
        threeTermDiscountPercent={discountPct}
        trialDays={trialDays}
        onSelectPlan={onSelectPlan}
      />

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#102846] text-white text-xs font-semibold">
                <th className="py-3.5 px-5">Student Population Band</th>
                <th className="py-3.5 px-5 text-right">NexaSua Core (Per Term)</th>
                <th className="py-3.5 px-5 text-right">NexaSua Complete (Per Term)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {bands.map((b) => (
                <tr key={b.code} className="hover:bg-[#FBF8F1]">
                  <td className="py-3.5 px-5 font-semibold text-[#102846]">{b.label}</td>
                  <td className="py-3.5 px-5 text-right font-mono tabular-nums text-[#102846]">
                    {b.isCustomQuote ? 'Custom Quotation' : formatGhs(b.corePriceGhs)}
                  </td>
                  <td className="py-3.5 px-5 text-right font-mono tabular-nums font-semibold text-[#148D82]">
                    {b.isCustomQuote ? 'Custom Quotation' : formatGhs(b.completePriceGhs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-[#102846]">
            Looking for white-label branding or bespoke features?
          </h3>
          <p className="text-sm text-[#64748B]">
            Explore NexaSua Custom by NexaFlow Technologies.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('/custom')}
          className="rounded-lg bg-[#102846] px-5 py-2.5 text-sm font-semibold text-white whitespace-nowrap"
        >
          View Custom Systems
        </button>
      </div>
    </div>
  );
}

function CustomSystemsPage() {
  const [form, setForm] = useState({
    schoolName: '',
    contactPerson: '',
    email: '',
    phone: '',
    location: '',
    studentPopulation: '401-800',
    requestedFeatures: ['White-label branding', 'Custom report cards'],
    budgetRange: 'GH₵8,000 – GH₵20,000',
    timeline: '1–3 Months',
    requirements: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const featureOptions = [
    'White-label branding',
    'Custom report cards',
    'Dedicated school portal & domain',
    'Custom school website',
    'Specialized academic workflows',
    'Dedicated hosting & SLA',
  ];

  const toggleFeature = (feat: string) => {
    setForm((prev) => ({
      ...prev,
      requestedFeatures: prev.requestedFeatures.includes(feat)
        ? prev.requestedFeatures.filter((f) => f !== feat)
        : [...prev.requestedFeatures, feat],
    }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    try {
      const res = await apiFetch<{ message: string; referenceNumber: string }>(
        '/api/public/custom-request',
        { method: 'POST', body: JSON.stringify(form) }
      );
      setResult({
        ok: true,
        text: `${res.message} Reference: ${res.referenceNumber}`,
      });
    } catch (err) {
      setResult({
        ok: false,
        text: err instanceof Error ? err.message : 'Submission failed.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-5 space-y-6">
          <div className="text-xs font-semibold text-[#148D82]">
            NexaSua Custom · NexaFlow Technologies
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#102846] leading-tight text-balance">
            Need a School Management System Built Specifically for Your School?
          </h1>
          <p className="text-base text-[#64748B] leading-relaxed">
            For school groups, international academies, and specialized institutions requiring
            dedicated branding, custom domains, or bespoke academic workflows.
          </p>

          <div className="space-y-4 pt-2">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-sm font-bold text-[#102846]">White-Label Configuration</div>
              <div className="text-sm font-mono text-[#148D82] mt-1 tabular-nums">
                Indicative setup from GH₵2,000 + recurring fee
              </div>
              <p className="text-xs text-[#64748B] mt-1.5">
                Personalized school branding, custom domain integration, custom report-card
                templates, and dedicated portal URL.
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-sm font-bold text-[#102846]">Bespoke System Development</div>
              <div className="text-sm font-mono text-[#148D82] mt-1 tabular-nums">
                Indicative quotations starting around GH₵8,000
              </div>
              <p className="text-xs text-[#64748B] mt-1.5">
                Custom school websites, specialized assessment rules, dedicated hosting where
                contracted, and ongoing maintenance. Prices are indicative pending scoping.
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8">
          <h2 className="text-xl font-bold text-[#102846] mb-6">Submit Custom Project Inquiry</h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">
                  School / Institution Name *
                </label>
                <input
                  required
                  value={form.schoolName}
                  onChange={(e) => setForm({ ...form, schoolName: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">
                  Contact Person *
                </label>
                <input
                  required
                  value={form.contactPerson}
                  onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">Email *</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">Phone *</label>
                <input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">
                  City / Region *
                </label>
                <input
                  required
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. Kumasi, Ashanti"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">
                  Student Population
                </label>
                <select
                  value={form.studentPopulation}
                  onChange={(e) => setForm({ ...form, studentPopulation: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option value="1-150">1–150</option>
                  <option value="151-400">151–400</option>
                  <option value="401-800">401–800</option>
                  <option value="801-1500">801–1,500</option>
                  <option value="1500+">Above 1,500</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">
                  Indicative Budget Range
                </label>
                <select
                  value={form.budgetRange}
                  onChange={(e) => setForm({ ...form, budgetRange: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option>GH₵2,000 – GH₵5,000 (White-label)</option>
                  <option>GH₵8,000 – GH₵20,000</option>
                  <option>GH₵20,000 – GH₵50,000</option>
                  <option>Above GH₵50,000</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#102846] mb-1">
                  Target Timeline
                </label>
                <select
                  value={form.timeline}
                  onChange={(e) => setForm({ ...form, timeline: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
                >
                  <option>Within 1 Month</option>
                  <option>1–3 Months</option>
                  <option>Next Academic Year</option>
                </select>
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-[#102846] mb-2">
                Requested Capabilities
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {featureOptions.map((feat) => (
                  <label
                    key={feat}
                    className="flex items-center gap-2 text-sm text-[#102846] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={form.requestedFeatures.includes(feat)}
                      onChange={() => toggleFeature(feat)}
                      className="accent-[#148D82]"
                    />
                    <span>{feat}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#102846] mb-1">
                Additional Requirements
              </label>
              <textarea
                rows={4}
                value={form.requirements}
                onChange={(e) => setForm({ ...form, requirements: e.target.value })}
                placeholder="Describe campus branches, custom report layouts, or domain preferences..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            {result && (
              <div
                className={`rounded-lg p-3 text-sm border ${
                  result.ok
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-red-50 border-red-200 text-red-900'
                }`}
              >
                {result.text}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#148D82] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#10766c] disabled:opacity-60"
            >
              {submitting ? 'Submitting Inquiry...' : 'Submit Custom Inquiry'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

function AboutPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        <div className="lg:col-span-6 space-y-5">
          <div className="text-xs font-semibold text-[#148D82]">NexaFlow Technologies</div>
          <h1 className="text-3xl sm:text-4xl font-bold text-[#102846]">
            Digitizing Ghanaian Education with Precision and Trust
          </h1>
          <p className="text-base text-[#64748B] leading-relaxed">
            NexaSua combines <strong>Nexa</strong> (modern technology and innovation) with{' '}
            <strong>Sua</strong> (a Twi word associated with learning). Built by NexaFlow
            Technologies, our platform equips Ghanaian headteachers, teachers, bursars, parents,
            and learners with dependable tools tailored to Ghana’s academic calendar and Ghana Cedi
            (GH₵) billing.
          </p>
          <p className="text-sm text-[#64748B]">
            Note: NexaSua is an independent software platform and does not claim official
            affiliation or endorsement by GES, NaCCA, or the Ministry of Education.
          </p>
          <button
            type="button"
            onClick={() => onNavigate('/contact')}
            className="rounded-lg bg-[#102846] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Contact NexaFlow Team
          </button>
        </div>
        <div className="lg:col-span-6">
          <div className="rounded-xl overflow-hidden border border-slate-200">
            <img
              src={OFFICE_IMAGE}
              alt="Ghanaian school headteacher reviewing terminal reports in school administration library"
              referrerPolicy="no-referrer"
              className="w-full h-auto object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function ContactPage() {
  const [form, setForm] = useState({
    contactName: '',
    contactEmail: '',
    subject: '',
    category: 'General Inquiry',
    description: '',
  });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await apiFetch<{ message: string; ticketNumber: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setStatus({ ok: true, msg: `${res.message} Ticket: ${res.ticketNumber}` });
      setForm({ contactName: '', contactEmail: '', subject: '', category: 'General Inquiry', description: '' });
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : 'Unable to send message.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <h1 className="text-3xl font-bold text-[#102846] mb-2">Contact NexaFlow Technologies</h1>
      <p className="text-sm text-[#64748B] mb-8">
        Reach our Accra support & onboarding team for school setup questions, billing, or data
        protection inquiries.
      </p>

      <form onSubmit={submit} className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[#102846] mb-1">Full Name *</label>
            <input
              required
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[#102846] mb-1">Email *</label>
            <input
              required
              type="email"
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#102846] mb-1">Subject *</label>
          <input
            required
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[#102846] mb-1">Message *</label>
          <textarea
            required
            rows={5}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {status && (
          <div
            className={`p-3 rounded-lg text-sm border ${
              status.ok
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {status.msg}
          </div>
        )}
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[#148D82] px-6 py-2.5 text-sm font-semibold text-white"
        >
          {busy ? 'Sending...' : 'Send Inquiry'}
        </button>
      </form>
    </div>
  );
}

function FaqPage({ onNavigate }: { onNavigate: (p: string) => void }) {
  const items = [
    ['Are individual students charged for NexaSua?', 'No. Only the school pays the termly subscription based on its active student population band.'],
    ['What happens if a school subscription expires?', 'Student academic and financial records are never deleted upon expiration. Schools retain read-only export access until renewed.'],
    ['Can schools configure their own grading scale instead of 30/70?', 'Yes. NexaSua provides a 30% continuous assessment / 70% exam template as an option, alongside full custom category and grading scale configuration.'],
    ['Does QR verification expose student grades publicly?', 'No. Scanning a report card QR code verifies only authenticity, school name, academic term, and issue date—never private student records.'],
    ['How do online school fee payments work?', 'Complete-plan schools configure their own Paystack merchant keys in School Settings so fees settle directly to the school, separate from NexaFlow subscription billing.'],
  ];
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-6">
      <h1 className="text-3xl font-bold text-[#102846]">Frequently Asked Questions</h1>
      <div className="space-y-4">
        {items.map(([q, a]) => (
          <div key={q} className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-base font-bold text-[#102846]">{q}</h2>
            <p className="mt-2 text-sm text-[#64748B] leading-relaxed">{a}</p>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onNavigate('/register')}
        className="rounded-lg bg-[#148D82] px-5 py-2.5 text-sm font-semibold text-white"
      >
        Register Your School
      </button>
    </div>
  );
}

function LegalPage({ type }: { type: 'privacy' | 'terms' }) {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-6">
      <h1 className="text-3xl font-bold text-[#102846]">
        {type === 'privacy'
          ? 'Privacy Policy & Data Protection (Ghana Act 843)'
          : 'NexaSua Terms of Service'}
      </h1>
      <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4 text-sm text-[#64748B] leading-relaxed">
        {type === 'privacy' ? (
          <>
            <p>
              NexaFlow Technologies processes educational and administrative records strictly on
              behalf of subscribed schools acting as Data Controllers, aligned with the principles
              of the Data Protection Act, 2012 (Act 843) of Ghana.
            </p>
            <p>
              <strong className="text-[#102846]">Tenant Isolation & Children’s Privacy:</strong>{' '}
              Each school’s records are logically isolated. Student data is never indexed in public
              search, never sold, and never transmitted to external AI services by default.
            </p>
            <p>
              <strong className="text-[#102846]">Guardian Verification & Audit Trails:</strong>{' '}
              Parents only access children verified by their school administrator. Every grade
              approval, correction, and financial transaction generates an immutable audit trail.
            </p>
          </>
        ) : (
          <>
            <p>
              NexaSua is provided by NexaFlow Technologies on a termly or three-term prepaid SaaS
              subscription basis (Core or Complete) with a 7-day introductory trial upon school
              approval.
            </p>
            <p>
              Schools remain sole owners of their academic and financial records and may export
              their records at any time through authorized administrator tools.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function VerifyReportPage() {
  const params = new URLSearchParams(window.location.search);
  const [token, setToken] = useState(params.get('token') || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    valid: boolean;
    schoolName?: string;
    location?: string;
    academicYear?: string;
    termName?: string;
    referenceNumber?: string;
    issueDate?: string;
    note?: string;
    error?: string;
  } | null>(null);

  const verify = async (tok: string) => {
    if (!tok.trim()) return;
    setLoading(true);
    try {
      const data = await apiFetch<NonNullable<typeof result>>(
        `/api/public/verify-report/${encodeURIComponent(tok.trim())}`
      );
      setResult(data);
    } catch (err) {
      setResult({
        valid: false,
        error: err instanceof Error ? err.message : 'Verification failed.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (params.get('token')) {
      void verify(params.get('token')!);
    }
  }, []);

  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-5">
        <div className="flex items-center gap-2 text-[#148D82]">
          <ShieldCheck className="w-5 h-5" />
          <span className="text-xs font-semibold">Report Card Verification</span>
        </div>
        <h1 className="text-2xl font-bold text-[#102846]">Verify Terminal Report Authenticity</h1>
        <p className="text-sm text-[#64748B]">
          Enter or scan the QR verification token printed on a NexaSua terminal report card. For
          learner privacy, grades and personal details are never exposed publicly.
        </p>

        <div className="flex gap-2">
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="RC-NXS-..."
            className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => void verify(token)}
            disabled={loading}
            className="rounded-lg bg-[#148D82] px-4 py-2 text-sm font-semibold text-white whitespace-nowrap"
          >
            {loading ? 'Checking...' : 'Verify'}
          </button>
        </div>

        {result && (
          <div
            className={`rounded-lg border p-4 text-sm space-y-1.5 ${
              result.valid
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-red-50 border-red-200 text-red-900'
            }`}
          >
            {result.valid ? (
              <>
                <div className="font-bold flex items-center gap-1.5">
                  <FileText className="w-4 h-4" /> Authentic Report Record
                </div>
                <div>School: {result.schoolName} ({result.location})</div>
                <div>Reference: <span className="font-mono">{result.referenceNumber}</span></div>
                <div>Academic Period: {result.academicYear} · {result.termName}</div>
                <div>Issued: {formatGhanaDate(result.issueDate)}</div>
                <div className="text-xs text-emerald-800 pt-1">{result.note}</div>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                <span>{result.error}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
