import type { Workbench } from '../hooks/useWorkbench';

// 原生 <dialog> + form method=dialog：取消保留原文與閱讀位置，確認才清空。
export function CloseDialog({ wb }: { wb: Workbench }) {
  return (
    <dialog id="close-dialog" aria-labelledby="close-title" ref={wb.refs.dialogRef} onClose={wb.actions.onDialogClose}>
      <form method="dialog">
        <h2 id="close-title">確定要關閉嗎？</h2>
        <div className="dialog-actions">
          <button value="cancel" ref={wb.refs.cancelRef}>取消</button>
          <button value="confirm" className="confirm-button">關閉</button>
        </div>
      </form>
    </dialog>
  );
}
