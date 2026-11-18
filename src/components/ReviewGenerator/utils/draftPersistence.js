// 마지막으로 완성된 상태만 예약합니다. 생성 중에는 이전 스냅샷을 유지합니다.
export function createDraftPersistence(save, { delay = 500, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let pending = null
  let timer = null
  const cancelTimer = () => {
    if (timer !== null) cancel(timer)
    timer = null
  }
  const flush = () => {
    cancelTimer()
    if (pending) save(pending)
    pending = null
  }
  return {
    update(snapshot, suspended = false) {
      cancelTimer()
      if (suspended) return
      pending = snapshot
      timer = schedule(flush, delay)
    },
    cancelTimer,
    flush,
    dispose() {
      cancelTimer()
      pending = null
    },
  }
}
