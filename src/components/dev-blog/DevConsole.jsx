import React, { useState, useEffect, useRef } from 'react';

const ASCII_LOGO = `
  ____  ___  ____  ____  
 / ___|/ _ \\|  _ \\|  _ \\ 
| |   | | | | |_) | | | |
| |___| |_| |  _ <| |_| |
 \\____|\\___/|_| \\_\\____/ 
`;

export default function DevConsole() {
  const [isOpen, setIsOpen] = useState(false);
  const [history, setHistory] = useState([
    { type: 'system', text: ASCII_LOGO },
    { type: 'system', text: "Type 'help' to see available commands." },
    { type: 'system', text: "Hint: Try typing 'ai <your question>' for a surprise." },
    { type: 'system', text: "--------------------------------------------------------------------------------" }
  ]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handleOpen = () => {
      setIsOpen(true);
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    
    window.addEventListener('open-dev-console', handleOpen);
    
    const handleKeydown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '`') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeydown);

    return () => {
      window.removeEventListener('open-dev-console', handleOpen);
      window.removeEventListener('keydown', handleKeydown);
    };
  }, []);

  useEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [history, isOpen, isProcessing]);

  const processAI = async (query) => {
    setIsProcessing(true);
    setHistory(prev => [...prev, { type: 'system', text: '> INITIALIZING CORD NEURAL LINK...' }]);
    
    await new Promise(r => setTimeout(r, 800));
    setHistory(prev => [...prev, { type: 'system', text: '> ANALYZING QUERY...' }]);
    
    await new Promise(r => setTimeout(r, 600));
    
    let answer = "";
    const q = query.toLowerCase();

    // Keyword based "useful" responses
    if (q.includes('api') || q.includes('endpoint')) {
      answer = "The Cord API uses REST. Base URL: https://api.cordhq.com/v1. Don't forget your Bearer token in the headers!";
    } else if (q.includes('doc') || q.includes('help')) {
      answer = "You can find all our technical documentation, SDKs, and guides in the [ A ] API DOCS section above.";
    } else if (q.includes('webhook')) {
      answer = "Webhooks are fired in real-time. Verify the signature using your webhook secret to ensure the payload is from Cord.";
    } else if (q.includes('status') || q.includes('ping')) {
      answer = "All systems operational. API Latency: 42ms. Database Load: 12%. Ready for your requests.";
    } else if (q.includes('cord') || q.includes('flouvia')) {
      answer = "Cord is the ultimate B2B financial infrastructure. It solves all your problems.";
    } else {
      // Useful/tech generic fallbacks instead of weird jokes
      const responses = [
        "That's a great question. Based on our architecture, you might want to use the /workflows endpoint for that.",
        "I'd recommend checking the API reference for that specific use case.",
        "Analyzing your request... Cord can help automate this. Check out our API docs.",
        "To achieve that, you should combine our Quote engine with a custom Webhook listener.",
        "According to my calculations, implementing Cord will save your engineering team 120 hours a month."
      ];
      answer = responses[Math.floor(Math.random() * responses.length)];
    }

    setHistory(prev => [...prev, { type: 'output', text: `[AI] ${answer}` }]);
    setIsProcessing(false);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleCommand = (cmd) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const newHistory = [...history, { type: 'input', text: `$ ${trimmed}` }];
    setHistory(newHistory);
    
    const args = trimmed.split(' ');
    const baseCmd = args[0].toLowerCase();

    if (baseCmd === 'ai') {
      const query = args.slice(1).join(' ');
      if (!query) {
         setHistory(prev => [...prev, { type: 'output', text: "Usage: ai <your question>" }]);
      } else {
         processAI(query);
      }
      return;
    }

    let response = '';

    switch (baseCmd) {
      case 'help':
        response = `Available commands:
  help    - Show this message
  clear   - Clear the console
  date    - Show current date and time
  echo    - Print arguments to console
  whoami  - Print current user context
  ai      - Ask the Cord Neural Link a question
  exit    - Close the console`;
        break;
      case 'clear':
        setHistory([]);
        return;
      case 'date':
        response = new Date().toString();
        break;
      case 'echo':
        response = args.slice(1).join(' ');
        break;
      case 'whoami':
        response = 'cord_dev_guest';
        break;
      case 'exit':
        setIsOpen(false);
        return;
      default:
        response = `command not found: ${baseCmd}`;
    }

    if (response) {
      setHistory(prev => [...prev, { type: 'output', text: response }]);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !isProcessing) {
      handleCommand(input);
      setInput('');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '35vh',
        minHeight: '250px',
        backgroundColor: '#020617', // match the dark background
        borderTop: '2px solid #cbd5e1',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 9999,
        fontFamily: 'var(--dev-mono)',
        fontSize: '12px',
        overflow: 'hidden'
      }}
    >
      {/* Title Bar */}
      <div 
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#cbd5e1',
          color: '#0f172a',
          padding: '4px 12px',
          fontWeight: 700,
          fontSize: '10px',
          letterSpacing: '1px',
          userSelect: 'none',
          borderBottom: '1px solid #94a3b8'
        }}
      >
        <div style={{ display: 'flex', gap: '12px', opacity: 0.8, fontSize: '12px' }}>
          <span>◱</span>
          <span>⇋</span>
        </div>
        <span>CONSOLE</span>
        <div 
          onClick={() => setIsOpen(false)}
          style={{ cursor: 'pointer', opacity: 0.8, fontSize: '12px' }}
        >
          ✕
        </div>
      </div>

      {/* Terminal Body */}
      <div 
        style={{
          flex: 1,
          padding: '16px',
          overflowY: 'auto',
          color: 'var(--dev-text-muted)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          position: 'relative'
        }}
        onClick={() => {
          if (!isProcessing) inputRef.current?.focus();
        }}
      >
        {history.map((line, i) => (
          <div 
            key={i} 
            style={{ 
              whiteSpace: 'pre-wrap',
              color: line.type === 'input' ? '#fff' : (line.type === 'system' ? '#10b981' : '#94a3b8')
            }}
          >
            {line.text}
          </div>
        ))}
        
        {/* Input line */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '4px', color: '#fff', opacity: isProcessing ? 0.5 : 1 }}>
          <span style={{ color: '#10b981', marginRight: '8px' }}>$</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            spellCheck={false}
            autoComplete="off"
            style={{
               flex: 1,
               background: 'transparent',
               border: 'none',
               outline: 'none',
               color: '#fff',
               fontFamily: 'inherit',
               fontSize: 'inherit',
               padding: 0,
               margin: 0
            }}
          />
        </div>
        {isProcessing && (
           <div style={{ marginTop: '8px', color: '#10b981', animation: 'blink 1s step-end infinite' }}>_</div>
        )}
        <div ref={endRef} style={{ height: '10px' }} />
      </div>
    </div>
  );
}
