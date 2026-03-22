import { Bot, User } from 'lucide-react';

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export default function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  const isUser = role === 'user';

  return (
    <div className={`dc-chat-message${isUser ? ' dc-chat-message--user' : ''}`}>
      <div className="dc-chat-message__avatar">
        {isUser ? <User size={16} /> : <Bot size={16} color="var(--accent-primary)" />}
      </div>

      <div className="dc-chat-message__bubble">
        {content}
        {timestamp && (
          <div className="dc-chat-message__time">
            {new Date(timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
