export default function ChatInput() {
  return (
    <form
      className="border-t border-gray-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800"
      onSubmit={(event) => event.preventDefault()}
    >
      <textarea
        rows={2}
        placeholder="Введите сообщение…"
        className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-500 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100 dark:placeholder:text-gray-500"
      />
    </form>
  );
}
