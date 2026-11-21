import { useQuery } from '@tanstack/react-query';
import { AlertCircle, AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { DecisionBadge, RiskBadge } from '../components';
import { getSessionById } from '../services/api';
import type { Session, SessionMessage } from '../types';

const ROLE_CLASS: Record<string, string> = {
  admin: 'bg-blue-100 text-blue-800',
  sre: 'bg-green-100 text-green-800',
  developer: 'bg-orange-100 text-orange-800',
};

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}...` : id;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU');
}

function clip(text: string, max = 300): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

export default function SessionDetailPage() {
  const { sessionId = '' } = useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => getSessionById(sessionId),
    enabled: sessionId.length > 0,
    staleTime: 30_000,
  });

  const messages = [...(data?.messages ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  return (
    <div>
      <Link
        to="/sessions"
        className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Назад к сессиям
      </Link>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-500 py-8">
          <Loader2 className="w-6 h-6 animate-spin" />
          Загрузка сессии…
        </div>
      )}

      {isError && (
        <div className="flex items-center gap-2 text-red-600 py-4">
          <AlertCircle className="w-5 h-5 text-red-500" />
          Сессия не найдена
        </div>
      )}

      {data && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Сессия {shortId(data.session_id)}
          </h1>
          <div className="flex flex-wrap items-center gap-4 mb-6 text-sm text-gray-700">
            <StatusBadge status={data.status} />
            <RoleBadge role={data.user_role} />
            <span>
              {data.request_count}/{data.max_requests} запросов
            </span>
            <span className="text-gray-500">Создана: {fmtDate(data.created_at)}</span>
          </div>

          {messages.length === 0 ? (
            <p className="text-sm text-gray-400">В этой сессии пока нет проверок</p>
          ) : (
            messages.map((message, index) => (
              <MessageCard key={message.check_id} message={message} index={index} />
            ))
          )}
        </>
      )}
    </div>
  );
}

function MessageCard({ message, index }: { message: SessionMessage; index: number }) {
  return (
    <article className="bg-white border border-gray-200 rounded-lg p-4 mb-3">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-gray-400">#{index + 1}</span>
        <DecisionBadge decision={message.decision} size="md" />
        <RiskBadge riskLevel={message.risk_level} size="md" />
        {message.is_multi_step_attack && (
          <div className="w-full bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Многошаговая атака обнаружена
          </div>
        )}
        <span className="text-xs text-gray-500 ml-auto">{fmtDate(message.created_at)}</span>
      </div>
      <pre className="font-mono text-sm whitespace-pre-wrap bg-gray-50 rounded-lg p-3 text-gray-800">
        {clip(message.user_prompt)}
      </pre>
      <p className="mt-3 text-sm text-gray-600">{message.explanation}</p>
      <p className="mt-2 text-xs text-gray-400">
        {message.latency_ms} мс · {message.risk_category}
      </p>
    </article>
  );
}

function StatusBadge({ status }: { status: Session['status'] }) {
  const active = status === 'active';
  return (
    <span
      className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${
        active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
      }`}
    >
      {active ? 'Активна' : 'Закрыта'}
    </span>
  );
}

function RoleBadge({ role }: { role: string | null }) {
  if (!role) return <span className="text-gray-400">—</span>;
  return (
    <span
      className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_CLASS[role] ?? 'bg-gray-100 text-gray-700'}`}
    >
      {role}
    </span>
  );
}
