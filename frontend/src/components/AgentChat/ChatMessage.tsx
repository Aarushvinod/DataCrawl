import { Bot, User } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export default function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        padding: '12px 0',
        flexDirection: isUser ? 'row-reverse' : 'row',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          backgroundColor: isUser ? 'var(--accent-blue)' : 'var(--bg-elevated)',
          border: isUser ? 'none' : '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {isUser ? (
          <User size={16} color="#ffffff" />
        ) : (
          <Bot size={16} color="var(--accent-blue)" />
        )}
      </div>

      <div
        style={{
          maxWidth: '70%',
          backgroundColor: isUser ? 'var(--accent-blue)' : 'var(--bg-surface)',
          color: isUser ? '#ffffff' : 'var(--text-primary)',
          border: isUser ? 'none' : '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '10px 14px',
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {content}
        {timestamp && (
          <div
            style={{
              fontSize: 11,
              color: isUser ? 'rgba(255,255,255,0.7)' : 'var(--text-muted)',
              marginTop: 4,
            }}
          >
            {new Date(timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
