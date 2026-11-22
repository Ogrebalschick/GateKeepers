import DecisionBadge from '../DecisionBadge';
import RiskBadge from '../RiskBadge';
import type { SessionMessage } from '../../types';

interface MessageBubbleProps {
  message: SessionMessage;
  fullText?: string;
  attachmentNames?: string[];
  agentText?: string;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('ru', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function MessageBubble({
  message,
  fullText,
  attachmentNames = [],
  agentText,
}: MessageBubbleProps) {
  const text = fullText ?? message.user_prompt;

  return (
    <article className="space-y-2">
      <p className="text-xs font-medium text-gray-500 dark:text-slate-400">Вы сказали</p>
      <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">{text}</p>
      {attachmentNames.length > 0 && (
        <ul className="space-y-0.5 text-xs text-gray-500 dark:text-slate-400">
          {attachmentNames.map((name, index) => (
            <li key={`${name}-${index}`}>📎 {name}</li>
          ))}
        </ul>
      )}
      <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-2">
          <DecisionBadge decision={message.decision} size="sm" />
          <RiskBadge riskLevel={message.risk_level} size="sm" />
          <span className="text-xs text-gray-500 dark:text-slate-400">{message.risk_category}</span>
          <span className="ml-auto text-xs text-gray-500 dark:text-slate-400">
            {formatTime(message.created_at)}
          </span>
        </div>
        {message.explanation && (
          <p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{message.explanation}</p>
        )}
        {message.is_multi_step_attack === true && (
          <div className="mt-3 rounded border-l-4 border-red-500 bg-red-100 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-200">
            ⚠️ Многошаговая атака обнаружена
          </div>
        )}
      </div>
      {agentText && (
        <div className="rounded-lg bg-blue-50 px-3 py-2 dark:bg-slate-700">
          <p className="text-xs font-medium text-gray-500 dark:text-slate-400">DevOps-ассистент</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
            {agentText}
          </p>
        </div>
      )}
    </article>
  );
}
