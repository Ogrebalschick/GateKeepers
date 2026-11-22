import { Loader2 } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import toast from 'react-hot-toast';

const MAX_FILE_BYTES = 64 * 1024;

const FILE_TYPES: Record<string, string> = {
  txt: 'txt',
  md: 'md',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
};

export interface ChatAttachment {
  name: string;
  type: string;
  content: string;
  size: number;
}

interface ChatInputProps {
  disabled: boolean;
  pending: boolean;
  onSend: (text: string, attachments: ChatAttachment[]) => Promise<boolean>;
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} Б`;
  return `${(size / 1024).toFixed(1)} КБ`;
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file, 'UTF-8');
  });
}

export default function ChatInput({ disabled, pending, onSend }: ChatInputProps) {
  const [value, setValue] = useState('');
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const blocked = disabled || pending;

  async function addFiles(list: FileList | null) {
    if (!list || blocked) return;
    const next: ChatAttachment[] = [];
    for (const file of Array.from(list)) {
      const type = FILE_TYPES[fileExtension(file.name)];
      if (!type) {
        toast.error('Можно прикрепить txt, md, json или yaml');
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error('Файл больше 64 КБ');
        continue;
      }
      try {
        const content = await readAsText(file);
        if (!content) continue;
        next.push({ name: file.name, type, content, size: file.size });
      } catch {
        toast.error('Не удалось прочитать файл');
      }
    }
    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
  }

  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(event.target.files);
    event.target.value = '';
  }

  async function send() {
    const text = value.trim();
    if (!text || blocked) return;
    const payload = attachments.filter((file) => file.content.length > 0);
    const ok = await onSend(text, payload);
    if (ok) {
      setValue('');
      setAttachments([]);
    }
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
      {attachments.length > 0 && (
        <ul className="mb-2 space-y-2">
          {attachments.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs dark:border-slate-600 dark:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 truncate font-medium text-gray-900 dark:text-gray-100">
                  {file.name}
                </span>
                <button
                  type="button"
                  aria-label={`Снять ${file.name}`}
                  disabled={blocked}
                  onClick={() => setAttachments((prev) => prev.filter((_, i) => i !== index))}
                  className="shrink-0 cursor-pointer px-1 text-base leading-none text-gray-500 hover:text-gray-900 disabled:cursor-not-allowed dark:hover:text-gray-100"
                >
                  ×
                </button>
              </div>
              <p className="mt-0.5 text-gray-500 dark:text-slate-400">{formatSize(file.size)}</p>
              <p className="mt-1 whitespace-pre-wrap text-gray-600 dark:text-gray-300">
                {file.content.slice(0, 120)}
              </p>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.json,.yaml,.yml,text/plain"
          multiple
          className="hidden"
          onChange={onFiles}
        />
        <button
          type="button"
          aria-label="Прикрепить файл"
          disabled={blocked}
          onClick={() => fileRef.current?.click()}
          className="inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-gray-200 text-base hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:hover:bg-slate-700"
        >
          📎
        </button>
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
