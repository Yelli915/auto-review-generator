// 스트림 본문을 줄 단위로 돌려줍니다. 끝에 줄바꿈이 없어도 마지막 줄까지 돌려줍니다.
export async function* readLines(body) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    buffer += done ? `${decoder.decode()}\n` : decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    yield* lines
    if (done) return
  }
}
