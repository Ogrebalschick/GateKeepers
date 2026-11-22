import { useState, type ReactNode } from 'react';

interface ChatLayoutProps {
  sidebar: ReactNode;
  children: ReactNode;
}

export default function ChatLayout({ sidebar, children }: ChatLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative -m-6 flex h-[calc(100vh-3.25rem)] min-h-0 overflow-hidden md:h-[calc(100vh-0px)]">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Закрыть список чатов"
          className="fixed inset-0 z-40 cursor-pointer bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={[
          'flex w-72 shrink-0 min-h-0 flex-col border-r border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800',
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
          'md:static md:z-auto md:translate-x-0',
        ].join(' ')}
      >
        {sidebar}
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-gray-50 dark:bg-slate-900">
        <div className="flex items-center border-b border-gray-200 px-4 py-2 dark:border-slate-700 md:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-slate-800"
          >
            Чаты
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
