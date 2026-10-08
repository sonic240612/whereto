import { Component, type ErrorInfo, type ReactNode } from 'react'

export default class ErrorBoundary extends Component<{children: ReactNode}, {failed: boolean}> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('WhereTo 화면 오류', error, info.componentStack) }
  render() {
    if (this.state.failed) return (
      <main role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-xl font-bold">화면을 불러오지 못했어요</h1>
        <p>저장된 방문 기록은 지우지 않았습니다. 처음으로 돌아가 다시 시도해주세요.</p>
        <a href="/" className="rounded-xl bg-primary px-6 py-3 text-white">처음으로</a>
      </main>
    )
    return this.props.children
  }
}
