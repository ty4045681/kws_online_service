import type { DetectionRecord } from "../app/KwsSessionController";

interface DetectionHistoryProps {
  records: readonly DetectionRecord[];
}

export function DetectionHistory({ records }: DetectionHistoryProps) {
  return (
    <section className="history-panel glass-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">EVENT LOG</p>
          <h2>检测历史</h2>
        </div>
        <span className="history-count">{records.length} 条</span>
      </div>

      {records.length === 0 ? (
        <div className="empty-history">
          <span className="history-pulse" />
          <div>
            <strong>等待唤醒事件</strong>
            <p>检测成功后会在这里记录关键词和触发区间。</p>
          </div>
        </div>
      ) : (
        <ol className="history-list">
          {records.map((record) => (
            <li key={record.id}>
              <span className="history-success">✓</span>
              <div>
                <strong>{record.keyword}</strong>
                <small>{record.tokens.join(" · ")}</small>
              </div>
              <div className="history-time">
                <time dateTime={new Date(record.detectedAt).toISOString()}>
                  {new Intl.DateTimeFormat("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  }).format(record.detectedAt)}
                </time>
                <small>
                  {record.startTime.toFixed(2)}–{record.endTime.toFixed(2)}s
                </small>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
