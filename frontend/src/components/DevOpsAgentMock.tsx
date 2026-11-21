import { AlertCircle, Bot, CheckCircle, XCircle } from 'lucide-react';

export type AgentStatus = 'idle' | 'allowed' | 'blocked' | 'pending_confirmation';

interface Props {
  status: AgentStatus;
  response?: string;
}

const SHELL =
  'bg-white border-2 rounded-lg p-6 shadow-sm transition-all duration-500 min-h-48 min-w-0';

export default function DevOpsAgentMock({ status, response }: Props) {
  if (status === 'allowed') {
    return (
      <div className={`${SHELL} border-green-300`}>
        <div className="flex items-start gap-3">
          <CheckCircle className="w-8 h-8 text-green-500 shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900">DevOps-ассистент</h3>
            <p className="mt-2 text-sm font-medium text-green-700">
              Запрос передан DevOps-ассистенту
            </p>
            {response && (
              <p className="mt-3 text-sm text-gray-700 leading-relaxed">
                <span className="font-medium text-gray-500">Ответ агента: </span>
                {response}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === 'blocked') {
    return (
      <div className={`${SHELL} border-red-300`}>
        <div className="flex items-start gap-3">
          <XCircle className="w-8 h-8 text-red-500 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">DevOps-ассистент</h3>
            <p className="mt-2 text-sm font-medium text-red-700">
              Запрос заблокирован Сторожем
            </p>
            <p className="mt-2 text-sm text-gray-600">
              DevOps-ассистент не получил запрос
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'pending_confirmation') {
    return (
      <div className={`${SHELL} border-yellow-300`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-8 h-8 text-yellow-500 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-gray-900">DevOps-ассистент</h3>
            <p className="mt-2 text-sm font-medium text-yellow-700">
              Ожидание подтверждения пользователя
            </p>
            <p className="mt-2 text-sm text-gray-600">
              Запрос дойдёт до агента только после явного подтверждения
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${SHELL} border-gray-200`}>
      <div className="flex flex-col items-center justify-center text-center py-6 text-gray-400">
        <Bot className="w-8 h-8 text-gray-400 animate-pulse" />
        <p className="mt-3 text-sm">Ожидание решения Сторожа...</p>
      </div>
    </div>
  );
}
