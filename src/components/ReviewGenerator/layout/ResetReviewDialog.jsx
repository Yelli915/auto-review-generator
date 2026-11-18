export default function ResetReviewDialog({ dialogRef, onConfirm }) {
  return (
    <dialog ref={dialogRef} className="reset-dialog" aria-labelledby="reset-dialog-title" aria-describedby="reset-dialog-description">
      <h2 id="reset-dialog-title">새 리뷰를 시작할까요?</h2>
      <p id="reset-dialog-description">현재 입력과 초안 버전이 지워져요. 필요한 리뷰는 먼저 복사해 주세요.</p>
      <div className="reset-dialog__actions">
        <button type="button" className="btn btn--secondary" onClick={() => dialogRef.current.close()}>계속 보관하기</button>
        <button type="button" className="btn btn--primary" onClick={() => { dialogRef.current.close(); onConfirm() }}>새로 시작하기</button>
      </div>
    </dialog>
  )
}
