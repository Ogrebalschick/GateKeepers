/**
 * Имитация ответа DevOps-ассистента для демо.
 * Реальный агент в хакатоне — заглушка.
 */
export function getMockAgentResponse(userPrompt: string): string {
  const text = userPrompt.toLowerCase();

  if (text.includes('лог') || text.includes('log')) {
    return 'Логи за последний час: ошибок не обнаружено. 1,234 записей обработано.';
  }
  if (text.includes('перезапуск') || text.includes('restart')) {
    return 'Сервис успешно перезапущен. Время простоя: 2.3с. Все проверки здоровья пройдены.';
  }
  if (text.includes('статус') || text.includes('status')) {
    return 'Статус: работает нормально. Uptime: 99.9%. Последнее обновление: 2 часа назад.';
  }
  return 'Запрос обработан. Результат: операция выполнена успешно.';
}
