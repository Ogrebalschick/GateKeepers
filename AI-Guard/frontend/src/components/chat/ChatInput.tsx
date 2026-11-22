import { Loader2 } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';

interface ChatInputProps {
  disabled: boolean;
  pending: boolean;
  onSend: (text: string) => Promise<boolean>;
}

export default function ChatInput({ disabled, pending, onSend }: ChatInputProps) {
  const [value, setValue] = useState('');
  const blocked = disabled || pending;

  async function send() {
    const text = value.trim();
    if (!text || blocked) return;
    const ok = await onSend(text);
    if (ok) setValue('');
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <form
      className="border-t border-gray-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
      onSubmit={onSubmit}
    >
      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          value={value}
          disabled={blocked}
          placeholder="Сообщение DevOps-агенту…"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100 dark:placeholder:text-gray-500"
        />
        <button
          type="submit"
          disabled={blocked || !value.trim()}
          className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Отправить
        </button>
      </div>
    </form>
  );
}
