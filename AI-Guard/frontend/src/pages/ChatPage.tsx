import { MessageSquare } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import ChatLayout from '../components/chat/ChatLayout';

export default function ChatPage() {
  const [selectedSessionId] = useState<string | null>(null);

  return (
    <ChatLayout
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="border-b border-gray-200 px-4 py-4 dark:border-slate-700">
            <h1 className="text-base font-semibold text-gray-900 dark:text-gray-100">💬 Чаты</h1>
            <button
              type="button"
              onClick={() => toast('Дальше в CHAT-003')}
              className="mt-3 flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
            >
              ➕ Новый чат
            </button>
          </div>
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <MessageSquare className="mb-3 h-12 w-12 text-gray-300 dark:text-slate-500" />
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          {selectedSessionId
            ? `Чат ${selectedSessionId.slice(0, 8)}`
            : 'Выберите чат или создайте новый'}
        </p>
      </div>
    </ChatLayout>
  );
}
