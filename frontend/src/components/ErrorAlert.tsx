import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

// 開檔失敗：shadcn Alert，根元素保留 id="error" role="alert"。
export function ErrorAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <Alert
      id="error"
      className="mt-6 max-w-lg rounded-xl border-danger-line bg-danger-tint px-4 py-3 text-left text-danger animate-in fade-in slide-in-from-bottom-1 duration-200"
    >
      <CircleAlert aria-hidden="true" />
      <AlertTitle>無法開啟檔案</AlertTitle>
      <AlertDescription className="text-ink-2 leading-relaxed">{message}</AlertDescription>
    </Alert>
  );
}
