import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  PieChart,
  Layers,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Sparkles,
  Award,
  ChevronLeft,
} from 'lucide-react';
import { Lead, PipelineStage, STAGE_CONFIG } from '../types/crm.ts';
import { formatCurrency } from '../utils/crmCalculations.ts';

interface AdvancedAnalyticsViewProps {
  leads: Lead[];
  onBackToDashboard?: () => void;
  onSelectLead?: (lead: Lead) => void;
}

export const AdvancedAnalyticsView: React.FC<AdvancedAnalyticsViewProps> = ({
  leads,
  onBackToDashboard,
  onSelectLead,
}) => {
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');

  // Filter leads if specific industry selected
  const filteredLeads = useMemo(() => {
    if (selectedIndustry === 'all') return leads;
    return leads.filter((l) => l.industry?.toLowerCase() === selectedIndustry.toLowerCase());
  }, [leads, selectedIndustry]);

  // Distinct industries
  const industries = useMemo(() => {
    const set = new Set<string>();
    leads.forEach((l) => {
      if (l.industry) set.add(l.industry);
    });
    return Array.from(set);
  }, [leads]);

  // Advanced Sales Metrics Calculation
  const analytics = useMemo(() => {
    let totalValue = 0;
    let wonValue = 0;
    let activeValue = 0;
    let lostValue = 0;

    const stageCounts: Record<PipelineStage, { count: number; value: number }> = {
      Prospect: { count: 0, value: 0 },
      Meeting: { count: 0, value: 0 },
      Negotiation: { count: 0, value: 0 },
      'Closing Won': { count: 0, value: 0 },
      'Closing Lost': { count: 0, value: 0 },
    };

    const agingBuckets = {
      fresh: 0, // < 14 days
      standard: 0, // 15 - 30 days
      aging: 0, // > 30 days
    };

    const now = Date.now();
    let totalLeadAgeDays = 0;
    let leadsWithCreationDates = 0;

    for (const lead of filteredLeads) {
      const val = Number(lead.deal_value) || 0;
      totalValue += val;
      const stage = lead.pipeline_stage || 'Prospect';

      if (stage in stageCounts) {
        stageCounts[stage].count++;
        stageCounts[stage].value += val;
      }

      if (stage === 'Closing Won') {
        wonValue += val;
      } else if (stage === 'Closing Lost') {
        lostValue += val;
      } else {
        activeValue += val;
      }

      // Calculate Aging
      if (lead.created_at) {
        const createdMs = new Date(lead.created_at).getTime();
        if (!isNaN(createdMs)) {
          const daysOld = Math.max(0, Math.floor((now - createdMs) / (1000 * 60 * 60 * 24)));
          totalLeadAgeDays += daysOld;
          leadsWithCreationDates++;

          if (stage !== 'Closing Won' && stage !== 'Closing Lost') {
            if (daysOld <= 14) {
              agingBuckets.fresh++;
            } else if (daysOld <= 30) {
              agingBuckets.standard++;
            } else {
              agingBuckets.aging++;
            }
          }
        }
      }
    }

    const closedTotal = stageCounts['Closing Won'].count + stageCounts['Closing Lost'].count;
    const winRate = closedTotal > 0 ? (stageCounts['Closing Won'].count / closedTotal) * 100 : 0;
    const activeDealsCount =
      stageCounts.Prospect.count + stageCounts.Meeting.count + stageCounts.Negotiation.count;

    const avgDealValue =
      stageCounts['Closing Won'].count > 0
        ? wonValue / stageCounts['Closing Won'].count
        : activeValue / Math.max(1, activeDealsCount);

    const avgLeadAgeDays = leadsWithCreationDates > 0 ? Math.round(totalLeadAgeDays / leadsWithCreationDates) : 0;

    return {
      totalValue,
      wonValue,
      activeValue,
      lostValue,
      stageCounts,
      agingBuckets,
      winRate: Math.round(winRate * 10) / 10,
      avgDealValue: Math.round(avgDealValue),
      avgLeadAgeDays,
      activeDealsCount,
    };
  }, [filteredLeads]);

  return (
    <div className="space-y-6 pb-24 animate-in fade-in duration-150">
      {/* Top Header & Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1f1f1f] pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-[#6b665c] font-medium mb-1">
            {onBackToDashboard && (
              <button
                onClick={onBackToDashboard}
                className="hover:text-[#0F2C59] flex items-center gap-1 font-semibold transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Dashboard</span>
              </button>
            )}
            <span>/</span>
            <span className="text-[#0F2C59] font-bold">Analitik penjualan</span>
          </div>
          <h2 className="text-xl font-bold text-[#0F2C59] tracking-tight flex items-center gap-2 font-serif-heading">
            <TrendingUp className="w-5 h-5 text-[#00A8E8]" />
            Analitik pipeline
          </h2>
          <p className="text-xs text-[#6b665c] font-medium">
            Snapshot berdasarkan Lead saat ini; data ini tidak menyimpan waktu perpindahan tahap historis.
          </p>
        </div>

        {/* Industry Filter Selector */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#00A8E8] shrink-0" />
          <select
            value={selectedIndustry}
            onChange={(e) => setSelectedIndustry(e.target.value)}
            className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[8px] px-3 py-1.5 text-xs font-semibold text-[#1f1f1f] focus:outline-none focus:ring-1 focus:ring-[#00A8E8]"
          >
            <option value="all">Semua Industri ({leads.length})</option>
            {industries.map((ind) => (
              <option key={ind} value={ind}>
                {ind}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 1. KEY SNAPSHOT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Active Pipeline Value */}
        <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-4">
          <div className="flex items-center justify-between text-[#6b665c] mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F2C59]">
              Nilai Pipeline Aktif
            </span>
            <Sparkles className="w-4 h-4 text-[#00A8E8]" />
          </div>
          <div className="text-xl font-extrabold text-[#0F2C59] font-mono">
            {formatCurrency(analytics.activeValue)}
          </div>
          <div className="text-[11px] text-[#6b665c] mt-1">
            Total nilai Lead Prospect, Meeting, dan Negotiation; bukan pendapatan aktual.
          </div>
        </div>

        {/* Win Rate */}
        <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-4">
          <div className="flex items-center justify-between text-[#6b665c] mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F2C59]">
              Win Share (Closed)
            </span>
            <Award className="w-4 h-4 text-[#ff4800]" />
          </div>
          <div className="text-xl font-extrabold text-[#1f1f1f] font-mono">
            {analytics.winRate}%
          </div>
          <div className="text-[11px] text-[#6b665c] mt-1">
            {analytics.stageCounts['Closing Won'].count} Won deals vs{' '}
            {analytics.stageCounts['Closing Lost'].count} Lost
          </div>
        </div>

        {/* Avg Sales Cycle Time */}
        <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-4">
          <div className="flex items-center justify-between text-[#6b665c] mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F2C59]">
              Rata-rata Umur Lead
            </span>
            <Clock className="w-4 h-4 text-[#00A8E8]" />
          </div>
          <div className="text-xl font-extrabold text-[#1f1f1f] font-mono">
            {analytics.avgLeadAgeDays} Days
          </div>
          <div className="text-[11px] text-[#6b665c] mt-1">
            Hari sejak Lead dibuat; bukan lama siklus sampai closing.
          </div>
        </div>

        {/* Avg Deal Size */}
        <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[16px] p-4">
          <div className="flex items-center justify-between text-[#6b665c] mb-1">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#0F2C59]">
              Average Deal Value
            </span>
            <DollarSign className="w-4 h-4 text-[#0F2C59]" />
          </div>
          <div className="text-xl font-extrabold text-[#1f1f1f] font-mono">
            {formatCurrency(analytics.avgDealValue)}
          </div>
          <div className="text-[11px] text-[#6b665c] mt-1">
            Rata-rata Won, atau rata-rata pipeline aktif bila belum ada Won.
          </div>
        </div>
      </div>

      {/* 2. CURRENT STAGE DISTRIBUTION */}
      <section className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-[#0F2C59] flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#00A8E8]" />
              Distribusi Stage Saat Ini
            </h3>
            <p className="text-xs text-[#6b665c]">
              Jumlah dan nilai Lead pada tahap saat ini; tidak menyiratkan perpindahan historis.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] text-[#0F2C59]">
            {filteredLeads.length} Total Lead
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Prospect */}
          <div className="p-4 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[12px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-[#1f1f1f]">
                <span>1. Prospect</span>
                <span className="font-mono">{analytics.stageCounts.Prospect.count}</span>
              </div>
              <div className="text-xs font-bold text-[#6b665c] mt-1">
                {formatCurrency(analytics.stageCounts.Prospect.value)}
              </div>
            </div>
          </div>

          {/* Meeting */}
          <div className="p-4 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[12px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-[#ff4800]">
                <span>2. Meeting</span>
                <span className="font-mono text-[#1f1f1f]">{analytics.stageCounts.Meeting.count}</span>
              </div>
              <div className="text-xs font-bold text-[#6b665c] mt-1">
                {formatCurrency(analytics.stageCounts.Meeting.value)}
              </div>
            </div>
          </div>

          {/* Negotiation */}
          <div className="p-4 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[12px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-[#0F2C59]">
                <span>3. Negotiation</span>
                <span className="font-mono text-[#1f1f1f]">
                  {analytics.stageCounts.Negotiation.count}
                </span>
              </div>
              <div className="text-xs font-bold text-[#6b665c] mt-1">
                {formatCurrency(analytics.stageCounts.Negotiation.value)}
              </div>
            </div>
          </div>

          {/* Closing Won */}
          <div className="p-4 bg-[#edf7f1] border border-[#155e3c]/40 rounded-[12px] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs font-bold text-[#155e3c]">
                <span>4. Closing Won</span>
                <span className="font-mono">{analytics.stageCounts['Closing Won'].count}</span>
              </div>
              <div className="text-xs font-bold text-[#155e3c] mt-1">
                {formatCurrency(analytics.stageCounts['Closing Won'].value)}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#155e3c]/30 flex items-center justify-between text-[11px] text-[#155e3c] font-semibold">
              <span>Finality Locked</span>
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </section>

      {/* 3. PIPELINE AGING COHORTS & INDUSTRY SPREAD */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Deal Aging Cohorts */}
        <section className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F2C59] flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#00A8E8]" />
              Umur Pipeline Aktif
            </h3>
            <span className="text-[11px] text-[#6b665c] font-medium">
              {analytics.activeDealsCount} Active Deals
            </span>
          </div>

          <div className="space-y-2.5 text-xs">
            {/* Fresh */}
            <div className="flex items-center justify-between p-3 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#155e3c]"></span>
                <span className="font-bold text-[#1f1f1f]">0–14 hari</span>
              </div>
              <span className="font-mono font-bold text-[#1f1f1f]">
                {analytics.agingBuckets.fresh} accounts
              </span>
            </div>

            {/* Standard */}
            <div className="flex items-center justify-between p-3 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#00A8E8]"></span>
                <span className="font-bold text-[#1f1f1f]">15–30 hari</span>
              </div>
              <span className="font-mono font-bold text-[#1f1f1f]">
                {analytics.agingBuckets.standard} accounts
              </span>
            </div>

            {/* Aging */}
            <div className="flex items-center justify-between p-3 bg-[#fff5f0] border border-[#ff4800]/50 rounded-[8px]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff4800]"></span>
                <span className="font-bold text-[#ff4800]">Action Required (&gt; 30 days)</span>
              </div>
              <span className="font-mono font-bold text-[#ff4800]">
                {analytics.agingBuckets.aging} accounts
              </span>
            </div>
          </div>
        </section>

        {/* Industry Contribution Breakdown */}
        <section className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#0F2C59] flex items-center gap-2">
              <PieChart className="w-4 h-4 text-[#00A8E8]" />
              Industry Distribution
            </h3>
            <span className="text-[11px] text-[#6b665c] font-medium">
              {industries.length} Sectors
            </span>
          </div>

          <div className="space-y-2 text-xs max-h-52 overflow-y-auto pr-1">
            {industries.map((industry) => {
              const matched = filteredLeads.filter(
                (l) => l.industry?.toLowerCase() === industry.toLowerCase()
              );
              const totalIndValue = matched.reduce(
                (sum, l) => sum + (Number(l.deal_value) || 0),
                0
              );
              const percentage =
                analytics.totalValue > 0
                  ? Math.round((totalIndValue / analytics.totalValue) * 100)
                  : 0;

              return (
                <div
                  key={industry}
                  className="p-2.5 bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] flex items-center justify-between"
                >
                  <div className="min-w-0 pr-2">
                    <div className="font-bold text-[#1f1f1f] truncate">{industry}</div>
                    <div className="text-[10px] text-[#6b665c]">
                      {matched.length} deals • {percentage}% dari nilai Lead terpilih
                    </div>
                  </div>
                  <div className="text-right shrink-0 font-mono font-bold text-[#0F2C59]">
                    {formatCurrency(totalIndValue)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};
