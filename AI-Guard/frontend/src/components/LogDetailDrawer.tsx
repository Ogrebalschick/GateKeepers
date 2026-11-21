import { X } from 'lucide-react';
import DecisionBadge from './DecisionBadge';
import RiskBadge from './RiskBadge';
import type { LogDetail } from '../types';

interface Props {
  open: boolean;
  loading: boolean;
  detail: LogDetail | null;
  onClose: () => void;
}

const CONFIRM_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Ожидает', className: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Подтверждено', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Отклонено', className: 'bg-red-100 text-red-800' },
  none: { label: 'Не требуется', className: 'bg-gray-100 text-gray-600' },
};

function confirmationKey(detail: LogDetail): keyof typeof CONFIRM_STATUS {
  if (detail.confirm_status) return detail.confirm_status;
  return detail.decision === 'confirm' ? 'pending' : 'none';
}

export default function LogDetailDrawer({ open, loading, detail, onClose }: Props) {
  if (!open) return null;

  const status = detail ? CONFIRM_STATUS[confirmationKey(detail)] : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 cursor-pointer"
        aria-label="Закрыть"
        onClick={onClose}
      />
      <aside className="relative h-full w-96 max-w-full bg-white shadow-xl overflow-auto transition-transform duration-300 translate-x-0">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {detail ? `Детали проверки #${detail.id}` : 'Детали проверки'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть панель"
            className="cursor-pointer"
          >
            <X className="w-5 h-5 text-gray-500 hover:text-gray-800" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          {loading || !detail || !status ? (
            <p className="text-gray-400">Загрузка…</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <DecisionBadge decision={detail.decision} size="md" />
                <RiskBadge riskLevel={detail.risk_level} size="md" />
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Запрос</p>
                <p className="bg-gray-50 border border-gray-200 rounded-lg p-3 whitespace-pre-wrap break-words text-gray-800">
                  {detail.user_prompt}
                </p>
              </div>

              <Field label="Категория" value={detail.risk_category} />
              <Field label="Объяснение" value={detail.explanation} />
              <Field label="Задержка" value={`${detail.latency_ms} мс`} />
              <Field label="Слой" value={detail.pipeline_layer} />
              <Field label="Версия политики" value={String(detail.policy_version)} />

              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">
                  Статус подтверждения
                </p>
                <span
                  className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${status.className}`}
                >
                  {status.label}
                </span>
              </div>

              <Field
                label="Контекст"
                value={`${detail.context.user_name} · ${detail.context.user_role} · ${detail.context.user_id}`}
              />

              {detail.context.attachments.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wide text-gray-400 mb-2">Вложения</p>
                  <ul className="space-y-2">
                    {detail.context.attachments.map((file) => (
                      <li key={file.name} className="border border-gray-200 rounded-lg p-3">
                        <p className="font-medium text-gray-800">{file.name}</p>
                        <p className="mt-1 text-gray-600 break-words">
                          {file.content_preview.slice(0, 200)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-gray-800 break-words">{value}</p>
    </div>
  );
}
