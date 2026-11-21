import { DecisionBadge, RiskBadge } from '../components';
import type { Decision, RiskLevel } from '../types';

const DECISIONS: Decision[]  = ['allow', 'confirm', 'block'];
const RISK_LEVELS: RiskLevel[] = ['none', 'low', 'medium', 'high', 'critical'];

export default function DashboardPage() {
  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1 text-sm">Главная страница ИИ-Сторожа</p>
      </div>

      {/* ── DecisionBadge preview ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          DecisionBadge
        </h2>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-2">size=&quot;md&quot; (default)</p>
            <div className="flex flex-wrap gap-2">
              {DECISIONS.map((d) => (
                <DecisionBadge key={d} decision={d} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2">size=&quot;sm&quot;</p>
            <div className="flex flex-wrap gap-2">
              {DECISIONS.map((d) => (
                <DecisionBadge key={d} decision={d} size="sm" />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── RiskBadge preview ── */}
      <section className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          RiskBadge
        </h2>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-2">size=&quot;md&quot; (default)</p>
            <div className="flex flex-wrap gap-2">
              {RISK_LEVELS.map((r) => (
                <RiskBadge key={r} riskLevel={r} />
              ))}
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-2">size=&quot;sm&quot;</p>
            <div className="flex flex-wrap gap-2">
              {RISK_LEVELS.map((r) => (
                <RiskBadge key={r} riskLevel={r} size="sm" />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
